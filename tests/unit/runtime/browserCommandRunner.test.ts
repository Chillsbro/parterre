import {expect, test} from "bun:test";
import type {
  PlaywrightExecutionOptions,
  PlaywrightExecutor,
  PlaywrightRequest
} from "../../../src/playwright/index.js";
import type {RuntimeContext} from "../../../src/runtime/index.js";
import {createBrowserCommandRunner} from "../../../src/runtime/index.js";
import type {SessionEvent} from "../../../src/sessions/index.js";

function createFakeContext(options?: {
  browserOpened?: boolean;
  approve?: boolean;
}) {
  const events: SessionEvent[] = [];
  const retargets: (string | undefined)[] = [];
  const approvalRequests: {command: string; reason: string}[] = [];
  const context: RuntimeContext = {
    config: {
      provider: "copilot",
      workspace: "/workspace",
      model: "auto",
      storageDir: "/storage",
      playwrightCommand: "playwright-cli",
      redactions: []
    },
    frameFormat: "jpeg",
    sessionId: "session-1",
    playwrightSession: "pw-1",
    approvals: {
      request: async (request, reason) => {
        approvalRequests.push({command: request.command, reason});
        return options?.approve ?? true;
      },
      resolve: async () => {},
      abandonAll: () => {}
    },
    authorizedCodebaseRoots: new Set(),
    state: {
      browserOpened: options?.browserOpened ?? true,
      screencast: {
        retarget: async url => {
          retargets.push(url);
        },
        stop: () => {}
      }
    },
    onNotification: () => {},
    publish: async (event: SessionEvent) => {
      events.push(event);
    },
    flush: async () => {},
    isStopped: () => false,
    beginStop: runCleanup => runCleanup()
  };
  return {context, events, retargets, approvalRequests};
}

function createFakeExecutor(output = "") {
  const requests: PlaywrightRequest[] = [];
  const executionOptions: (PlaywrightExecutionOptions | undefined)[] = [];
  const executor: PlaywrightExecutor = async (request, options) => {
    requests.push(request);
    executionOptions.push(options);
    return {request, ok: true, output, artifacts: [], durationMs: 1};
  };
  return {executor, requests, executionOptions};
}

test("denies unknown commands without executing anything", async () => {
  const {context, events} = createFakeContext();
  const {executor, requests} = createFakeExecutor();
  const runner = createBrowserCommandRunner({context, executor});
  const result = await runner.run({id: "r1", command: "shell", args: []});
  expect(result.ok).toBe(false);
  expect(result.error).toContain("Unsupported Playwright command");
  expect(requests).toHaveLength(0);
  expect(events).toHaveLength(0);
});

test("requires approval for sensitive commands and honors denial", async () => {
  const {context, approvalRequests} = createFakeContext({approve: false});
  const {executor, requests} = createFakeExecutor();
  const runner = createBrowserCommandRunner({context, executor});
  const result = await runner.run({
    id: "r2",
    command: "cookie-clear",
    args: []
  });
  expect(approvalRequests).toEqual([
    {
      command: "cookie-clear",
      reason: "The cookie-clear command can mutate browser or filesystem state"
    }
  ]);
  expect(result).toEqual({ok: false, error: "User denied action"});
  expect(requests).toHaveLength(0);
});

test("auto-opens the browser before the first command", async () => {
  const {context} = createFakeContext({browserOpened: false});
  const {executor, requests} = createFakeExecutor();
  const runner = createBrowserCommandRunner({context, executor});
  const result = await runner.run({id: "r3", command: "goto", args: ["x"]});
  expect(result.ok).toBe(true);
  expect(requests.map(request => request.command)).toEqual([
    "open",
    "screenshot",
    "goto",
    "screenshot"
  ]);
  expect(context.state.browserOpened).toBe(true);
});

test("skips frame capture for commands without visual change", async () => {
  const {context, events} = createFakeContext();
  const {executor, requests} = createFakeExecutor();
  const runner = createBrowserCommandRunner({context, executor});
  await runner.run({id: "r4", command: "snapshot", args: []});
  expect(requests.map(request => request.command)).toEqual(["snapshot"]);
  expect(events.map(event => event.type)).toEqual([
    "playwright_started",
    "playwright_finished"
  ]);
});

test("retargets the screencast after tab commands", async () => {
  const {context, retargets} = createFakeContext();
  const {executor} = createFakeExecutor(
    "- 0: [A](https://a.example/)\n- 1: (current) [B](https://b.example/)"
  );
  const runner = createBrowserCommandRunner({context, executor});
  await runner.run({id: "r5", command: "tab-select", args: ["1"]});
  expect(retargets).toEqual(["https://b.example/"]);
});

test("owns video recording lifecycle state in the browser command runner", async () => {
  const {context} = createFakeContext();
  const {executor, requests, executionOptions} = createFakeExecutor();
  const runner = createBrowserCommandRunner({context, executor});

  await runner.run({id: "record", command: "video-start", args: []});
  await runner.run({id: "navigate", command: "goto", args: ["https://x.test"]});
  await runner.run({id: "stop", command: "video-stop", args: []});

  expect(requests.map(request => request.command)).toEqual([
    "video-start",
    "goto",
    "screenshot",
    "video-stop"
  ]);
  const recordingPath = executionOptions[0]?.videoRecordingPath;
  expect(recordingPath).toStartWith("/storage/session-1/artifacts/videos/");
  expect(executionOptions[1]?.videoRecordingPath).toBeUndefined();
  expect(executionOptions[3]?.videoRecordingPath).toBe(recordingPath);
});

test("waits for running browser work to stop when interrupted", async () => {
  const {context, events} = createFakeContext();
  const controller = new AbortController();
  let executorStarted = false;
  const executor: PlaywrightExecutor = async (request, options) => {
    executorStarted = true;
    await new Promise<void>(resolve => {
      options?.signal?.addEventListener("abort", () => resolve(), {once: true});
    });
    return {request, ok: true, output: "", artifacts: [], durationMs: 1};
  };
  const runner = createBrowserCommandRunner({context, executor});
  const running = runner.run(
    {id: "interrupt", command: "snapshot", args: []},
    {signal: controller.signal}
  );
  while (!executorStarted) await new Promise(resolve => setTimeout(resolve, 0));

  controller.abort();

  expect(await running).toEqual({ok: false, error: "Agent interrupted"});
  expect(events.map(event => event.type)).toEqual(["playwright_started"]);
});
