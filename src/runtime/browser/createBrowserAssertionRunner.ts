import {randomUUID} from "node:crypto";
import {
  type BrowserAssertionRequest,
  type BrowserAssertionResult,
  compileBrowserAssertion,
  parseBrowserAssertionOutput
} from "../../assertions/index.js";
import type {
  PlaywrightExecutor,
  PlaywrightRequest
} from "../../playwright/index.js";
import type {RuntimeContext} from "../types/index.js";
import type {BrowserCommandRunner} from "./createBrowserCommandRunner.js";

export interface BrowserAssertionRunner {
  run(
    request: BrowserAssertionRequest,
    options?: {signal: AbortSignal}
  ): Promise<BrowserAssertionResult>;
}

export function createBrowserAssertionRunner(options: {
  context: RuntimeContext;
  browser: BrowserCommandRunner;
  executor: PlaywrightExecutor;
  passedAssertionIds: Set<string>;
}): BrowserAssertionRunner {
  const {context, browser, executor, passedAssertionIds} = options;

  const captureEvidence = async (
    request: BrowserAssertionRequest,
    signal?: AbortSignal
  ): Promise<{artifacts: string[]; snapshot?: string}> => {
    const evidence = await Promise.allSettled([
      executor(
        {
          id: `${request.id}-evidence`,
          command: "screenshot",
          args: ["--hires"]
        },
        {signal}
      ),
      executor(
        {id: `${request.id}-snapshot`, command: "snapshot", args: []},
        {signal}
      )
    ]);
    const screenshot =
      evidence[0].status === "fulfilled" ? evidence[0].value : undefined;
    const snapshot =
      evidence[1].status === "fulfilled" ? evidence[1].value : undefined;
    return {
      artifacts: [
        ...(screenshot?.artifacts ?? []),
        ...(snapshot?.artifacts ?? [])
      ],
      ...(snapshot?.output ? {snapshot: snapshot.output} : {})
    };
  };

  return {
    async run(request, runOptions) {
      if (!context.state.browserOpened) {
        const opened = await browser.run(
          {
            id: `${request.id}-open`,
            command: "open",
            args: [],
            reason: "Initialize the live browser for an assertion"
          },
          runOptions
        );
        if (!opened.ok) {
          const result: BrowserAssertionResult = {
            protocol: "parterre.assertion.v1",
            id: request.id,
            label: request.label,
            assertion: request.assertion,
            outcome: "error",
            observed: null,
            durationMs: 0,
            error: opened.error ?? "Could not initialize the browser",
            artifacts: [],
            testHint: {locator: "page", matcher: "browser initialization"}
          };
          await context.publish({
            type: "assertion_finished",
            timestamp: new Date().toISOString(),
            result
          });
          return result;
        }
      }

      let result: BrowserAssertionResult;
      const cliRequest: PlaywrightRequest = {
        id: `${request.id}-${randomUUID()}`,
        command: "run-code",
        args: [compileBrowserAssertion(request)],
        reason: "Run a Parterre-compiled browser assertion"
      };
      try {
        const executed = await executor(cliRequest, {
          signal: runOptions?.signal
        });
        if (!executed.ok) throw new Error(executed.error ?? executed.output);
        const parsed = parseBrowserAssertionOutput(executed.output);
        const evidence =
          parsed.outcome === "passed"
            ? {artifacts: []}
            : await captureEvidence(request, runOptions?.signal);
        result = {...parsed, ...evidence};
      } catch (error) {
        const evidence = await captureEvidence(request, runOptions?.signal);
        result = {
          protocol: "parterre.assertion.v1",
          id: request.id,
          label: request.label,
          assertion: request.assertion,
          outcome: "error",
          observed: null,
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
          ...evidence,
          testHint: {locator: "page", matcher: "assertion execution"}
        };
      }
      if (result.outcome === "passed") passedAssertionIds.add(result.id);
      await context.publish({
        type: "assertion_finished",
        timestamp: new Date().toISOString(),
        result
      });
      return result;
    }
  };
}
