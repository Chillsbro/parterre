import {afterAll, beforeAll, expect, test} from "bun:test";
import {basename} from "node:path";
import {
  type FixtureServer,
  startFixtureServer
} from "../../support/fixtureServer.js";
import {
  type RuntimeHarness,
  startRuntimeHarness
} from "../../support/runtimeHarness.js";
import {
  createScriptedAgent,
  type ScriptedAgent
} from "../../support/scriptedAgent.js";

let fixture: FixtureServer;
let agent: ScriptedAgent;
let harness: RuntimeHarness;

beforeAll(async () => {
  fixture = startFixtureServer();
  agent = createScriptedAgent();
  harness = await startRuntimeHarness({agentFactory: agent.factory});
});

afterAll(async () => {
  await harness.dispose();
  fixture.stop();
});

test("auto-opens the browser and captures a frame for a visual command", async () => {
  agent.turns.push({
    steps: [
      {
        tool: "playwright_cli",
        input: {command: "goto", args: [`${fixture.url}/form`]}
      },
      {reply: "Opened the form page."}
    ]
  });
  await harness.controller.sendUserMessage("open the form page", true);
  await harness.waitForEvent(
    "agent_message",
    event =>
      event.message.type === "assistant_message" &&
      event.message.content === "Opened the form page."
  );
  const finished = await harness.waitForEvent(
    "playwright_finished",
    event => event.result.request.command === "goto"
  );
  expect(finished.result.ok).toBe(true);
  expect(finished.result.title).toBe("Fixture Form");
  expect(finished.result.url).toBe(`${fixture.url}/form`);
  const frame = finished.result.artifacts.find(artifact =>
    basename(artifact).endsWith(".png")
  );
  expect(frame).toBeDefined();
  expect(await Bun.file(frame!).exists()).toBe(true);
  const kinds = harness.timeline().map(item => item.kind);
  expect(kinds).toEqual(["user", "tool", "tool", "agent"]);
  const opened = harness.events.find(
    event =>
      event.type === "playwright_finished" &&
      event.result.request.command === "open"
  );
  expect(opened).toBeDefined();
}, 60000);

test("denies commands outside the allowlist without starting them", async () => {
  agent.turns.push({
    steps: [
      {tool: "playwright_cli", input: {command: "install-extension", args: []}},
      {reply: "That command was blocked."}
    ]
  });
  await harness.controller.sendUserMessage("install an extension", true);
  const result = agent.toolResults.at(-1) as {ok: boolean; error?: string};
  expect(result.ok).toBe(false);
  expect(result.error).toBe(
    "Unsupported Playwright command: install-extension"
  );
  const started = harness.events.find(
    event =>
      event.type === "playwright_started" &&
      event.request.command === "install-extension"
  );
  expect(started).toBeUndefined();
}, 60000);

test("runs a sensitive command after the user approves it", async () => {
  agent.turns.push({
    steps: [
      {
        tool: "playwright_cli",
        input: {
          command: "localstorage-set",
          args: ["fixtureKey", "fixtureValue"]
        }
      },
      {reply: "Stored the value."}
    ]
  });
  await harness.controller.sendUserMessage("store a value", false);
  const requested = await harness.waitForEvent(
    "approval_requested",
    event => event.request.command === "localstorage-set"
  );
  expect(requested.reason).toBe(
    "The localstorage-set command can mutate browser or filesystem state"
  );
  await harness.controller.resolveApproval(requested.request.id, true);
  const finished = await harness.waitForEvent(
    "playwright_finished",
    event => event.result.request.command === "localstorage-set"
  );
  expect(finished.result.ok).toBe(true);
  const resolved = await harness.waitForEvent(
    "approval_resolved",
    event => event.requestId === requested.request.id
  );
  expect(resolved.approved).toBe(true);
  await agent.waitForIdle();
}, 60000);

test("never executes a command the user denies", async () => {
  agent.turns.push({
    steps: [
      {
        tool: "playwright_cli",
        input: {command: "goto", args: ["file:///etc/hosts"]}
      },
      {reply: "I could not open that file."}
    ]
  });
  await harness.controller.sendUserMessage("open a local file", false);
  const requested = await harness.waitForEvent("approval_requested", event =>
    event.request.args.includes("file:///etc/hosts")
  );
  expect(requested.reason).toBe(
    "Local file navigation can expose filesystem content"
  );
  await harness.controller.resolveApproval(requested.request.id, false);
  await agent.waitForIdle();
  const result = agent.toolResults.at(-1) as {ok: boolean; error?: string};
  expect(result.ok).toBe(false);
  expect(result.error).toBe("User denied action");
  const started = harness.events.find(
    event =>
      event.type === "playwright_started" &&
      event.request.args.includes("file:///etc/hosts")
  );
  expect(started).toBeUndefined();
}, 60000);

test("keeps the live view flowing after a new tab becomes current", async () => {
  agent.turns.push({
    steps: [
      {
        tool: "playwright_cli",
        input: {command: "tab-new", args: [`${fixture.url}/animated`]}
      },
      {reply: "Opened the animated page in a new tab."}
    ]
  });
  const framesBefore = harness.frames.length;
  await harness.controller.sendUserMessage("open a new tab", true);
  const finished = await harness.waitForEvent(
    "playwright_finished",
    event => event.result.request.command === "tab-new"
  );
  expect(finished.result.ok).toBe(true);
  expect(finished.result.output).toContain("(current)");
  const deadline = Date.now() + 15000;
  while (harness.frames.length <= framesBefore && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  expect(harness.frames.length).toBeGreaterThan(framesBefore);
  expect(await Bun.file(harness.frames.at(-1)!).exists()).toBe(true);
}, 60000);
