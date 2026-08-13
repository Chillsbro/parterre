import {expect, test} from "bun:test";
import type {
  PlaywrightExecutor,
  PlaywrightRequest
} from "../../../src/playwright/index.js";
import {
  type BrowserCommandRunner,
  createBrowserAssertionRunner,
  type RuntimeContext
} from "../../../src/runtime/index.js";
import type {SessionEvent} from "../../../src/sessions/index.js";

function resultOutput(outcome: "passed" | "failed") {
  return `### Result\n${JSON.stringify({
    protocol: "parterre.assertion.v1",
    id: "assert-1",
    label: "checkout complete",
    assertion: {kind: "title", expected: "Done", match: "exact"},
    outcome,
    observed: outcome === "passed" ? "Done" : "Waiting",
    durationMs: 10,
    testHint: {locator: "page", matcher: 'toHaveTitle("Done")'}
  })}\n### Ran Playwright code\ncode`;
}

function setup(outcome: "passed" | "failed") {
  const events: SessionEvent[] = [];
  const requests: PlaywrightRequest[] = [];
  const context = {
    state: {browserOpened: true},
    publish: async (event: SessionEvent) => {
      events.push(event);
    }
  } as RuntimeContext;
  const browser = {run: async () => ({ok: true})} as BrowserCommandRunner;
  const executor: PlaywrightExecutor = async request => {
    requests.push(request);
    if (request.command === "run-code") {
      return {
        request,
        ok: true,
        output: resultOutput(outcome),
        artifacts: [],
        durationMs: 10
      };
    }
    return {
      request,
      ok: true,
      output: request.command === "snapshot" ? "- page snapshot" : "",
      artifacts: [`/${request.command}.artifact`],
      durationMs: 1
    };
  };
  const passedAssertionIds = new Set<string>();
  return {
    runner: createBrowserAssertionRunner({
      context,
      browser,
      executor,
      passedAssertionIds
    }),
    requests,
    events,
    passedAssertionIds
  };
}

test("records passing assertions without an approval or evidence capture", async () => {
  const {runner, requests, events, passedAssertionIds} = setup("passed");
  const result = await runner.run({
    id: "assert-1",
    label: "checkout complete",
    assertion: {kind: "title", expected: "Done", match: "exact"},
    timeoutMs: 1000
  });

  expect(result.outcome).toBe("passed");
  expect(requests.map(request => request.command)).toEqual(["run-code"]);
  expect(passedAssertionIds.has("assert-1")).toBe(true);
  expect(events).toContainEqual(
    expect.objectContaining({type: "assertion_finished", result})
  );
});

test("captures a managed screenshot and snapshot when an assertion fails", async () => {
  const {runner, requests, passedAssertionIds} = setup("failed");
  const result = await runner.run({
    id: "assert-1",
    label: "checkout complete",
    assertion: {kind: "title", expected: "Done", match: "exact"},
    timeoutMs: 1000
  });

  expect(result).toMatchObject({
    outcome: "failed",
    artifacts: ["/screenshot.artifact", "/snapshot.artifact"],
    snapshot: "- page snapshot"
  });
  expect(requests.map(request => request.command)).toEqual([
    "run-code",
    "screenshot",
    "snapshot"
  ]);
  expect(passedAssertionIds.size).toBe(0);
});
