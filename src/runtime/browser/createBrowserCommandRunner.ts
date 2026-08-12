import {
  evaluatePolicy,
  getBrowserCommandDescriptor,
  getRequestedArtifactPath,
  type PlaywrightExecutor,
  type PlaywrightRequest
} from "../../playwright/index.js";
import type {PlaywrightResult} from "../../sessions/index.js";
import {ensureScreencast} from "../capturing/index.js";
import type {RuntimeContext} from "../types/index.js";

export interface BrowserCommandResult {
  ok: boolean;
  output?: string;
  error?: string;
  artifacts?: string[];
  url?: string;
  title?: string;
}

export interface BrowserCommandRunner {
  run(
    request: PlaywrightRequest,
    options?: {signal: AbortSignal}
  ): Promise<BrowserCommandResult>;
}

export function createBrowserCommandRunner(options: {
  context: RuntimeContext;
  executor: PlaywrightExecutor;
}): BrowserCommandRunner {
  const {context, executor} = options;
  let activeVideoRecordingPath: string | undefined;

  const captureFrame = async (
    request: PlaywrightRequest,
    signal?: AbortSignal
  ): Promise<PlaywrightResult | undefined> => {
    try {
      const frame = await executor(
        {
          id: `${request.id}-frame`,
          command: "screenshot",
          args: ["--hires"]
        },
        {signal}
      );
      return frame.ok ? frame : undefined;
    } catch (error) {
      await context.publish({
        type: "process_error",
        timestamp: new Date().toISOString(),
        source: "playwright",
        message: `Live frame capture failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
      return undefined;
    }
  };

  const execute = async (
    request: PlaywrightRequest,
    signal?: AbortSignal
  ): Promise<BrowserCommandResult> => {
    signal?.throwIfAborted();
    const descriptor = getBrowserCommandDescriptor(request.command);
    await context.publish({
      type: "playwright_started",
      timestamp: new Date().toISOString(),
      request
    });
    const videoRecordingPath =
      request.command === "video-start"
        ? getRequestedArtifactPath(
            context.config.storageDir,
            context.sessionId,
            request
          )
        : request.command === "video-stop"
          ? activeVideoRecordingPath
          : undefined;
    const actionResult = await executor(request, {videoRecordingPath, signal});
    signal?.throwIfAborted();
    if (actionResult.ok && request.command === "video-start") {
      activeVideoRecordingPath = videoRecordingPath;
    }
    if (actionResult.ok && request.command === "video-stop") {
      activeVideoRecordingPath = undefined;
    }
    if (actionResult.ok && descriptor?.opensBrowser) {
      context.state.browserOpened = true;
      await ensureScreencast(context);
    }
    if (actionResult.ok && descriptor?.closesBrowser) {
      context.state.browserOpened = false;
    }
    if (actionResult.ok && descriptor?.affectsTabs) {
      const currentTabUrl = /\(current\)\s*\[[^\]]*\]\(([^)]+)\)/.exec(
        actionResult.output
      )?.[1];
      await context.state.screencast?.retarget(currentTabUrl);
    }
    const frameResult =
      actionResult.ok && descriptor?.visualChange
        ? await captureFrame(request, signal)
        : undefined;
    const result = {
      ...actionResult,
      artifacts: [...actionResult.artifacts, ...(frameResult?.artifacts ?? [])],
      ...(frameResult?.url ? {url: frameResult.url} : {}),
      ...(frameResult?.title ? {title: frameResult.title} : {})
    };
    await context.publish({
      type: "playwright_finished",
      timestamp: new Date().toISOString(),
      result
    });
    return {
      ok: result.ok,
      output: result.output,
      ...(result.error ? {error: result.error} : {}),
      artifacts: result.artifacts,
      ...(result.url ? {url: result.url} : {}),
      ...(result.title ? {title: result.title} : {})
    };
  };

  return {
    async run(
      request: PlaywrightRequest,
      runOptions?: {signal: AbortSignal}
    ): Promise<BrowserCommandResult> {
      if (context.isStopped()) {
        return {ok: false, error: "Playwright session is stopping"};
      }
      const decision = evaluatePolicy(request);
      if (decision.kind === "deny") {
        return {ok: false, error: decision.reason};
      }
      if (
        decision.kind === "approval" &&
        !(await context.approvals.request(
          request,
          decision.reason,
          runOptions?.signal
        ))
      ) {
        return {ok: false, error: "User denied action"};
      }
      try {
        runOptions?.signal.throwIfAborted();
        const descriptor = getBrowserCommandDescriptor(request.command);
        if (
          !context.state.browserOpened &&
          !descriptor?.opensBrowser &&
          !descriptor?.closesBrowser
        ) {
          const openResult = await execute(
            {
              id: `${request.id}-open`,
              command: "open",
              args: [],
              reason: "Initialize the live browser"
            },
            runOptions?.signal
          );
          if (!openResult.ok) return openResult;
        }
        return await execute(request, runOptions?.signal);
      } catch (error) {
        if (runOptions?.signal.aborted) {
          return {ok: false, error: "Agent interrupted"};
        }
        const message = error instanceof Error ? error.message : String(error);
        await context.publish({
          type: "process_error",
          timestamp: new Date().toISOString(),
          source: "playwright",
          message
        });
        return {ok: false, error: message};
      }
    }
  };
}
