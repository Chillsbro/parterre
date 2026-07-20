import {expect, test} from "bun:test";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {render} from "ink-testing-library";
import {App} from "../../src/app/index.js";
import type {AppConfig} from "../../src/config/index.js";
import type {TerminalGraphicsInfo} from "../../src/terminal/index.js";
import {
  assistantReply,
  createScriptedRuntime,
  type ScriptedRuntime
} from "../support/scriptedRuntime.js";

const graphics: TerminalGraphicsInfo = {
  cellWidth: 10,
  cellHeight: 20,
  terminalWidth: 1000,
  terminalHeight: 600,
  supportsSixelGraphics: false,
  supportsKittyGraphics: false,
  supportsITerm2Graphics: false
};

function createConfig(): AppConfig {
  return {
    provider: "copilot",
    workspace: resolve("."),
    model: "auto",
    storageDir: mkdtempSync(join(tmpdir(), "parterre-tui-")),
    playwrightCommand: "playwright-cli",
    redactions: []
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise(resolveWait => setTimeout(resolveWait, 20));
  }
}

async function submitInput(
  app: {stdin: {write(data: string): void}; frame: () => string},
  text: string
): Promise<void> {
  app.stdin.write(text);
  await waitFor(() => app.frame().includes(`❯ ${text}`));
  app.stdin.write("\r");
}

function renderApp(runtime: ScriptedRuntime) {
  const instance = render(
    <App
      config={createConfig()}
      graphics={graphics}
      createRuntime={runtime.createRuntime}
    />
  );
  return {
    ...instance,
    frame: () => instance.lastFrame() ?? "",
    async ready() {
      await waitFor(() =>
        (instance.lastFrame() ?? "").includes("Describe a task, or /")
      );
      await new Promise(resolveSettle => setTimeout(resolveSettle, 150));
    }
  };
}

test("renders a scripted exchange in the transcript", async () => {
  const runtime = createScriptedRuntime({
    respond: () => [assistantReply("Scripted reply.")]
  });
  const app = renderApp(runtime);
  await app.ready();
  await submitInput(app, "hello there");
  await waitFor(() => app.frame().includes("Scripted reply."));
  expect(runtime.sentMessages).toEqual([
    {content: "hello there", displayContent: "hello there"}
  ]);
  app.unmount();
});

test("keeps oddly spaced pasted code compact and submits it unchanged", async () => {
  const runtime = createScriptedRuntime();
  const app = renderApp(runtime);
  await app.ready();
  const pasted = `const value = 1;\n\n${" ".repeat(40)}return value;`;
  app.stdin.write(`\x1b[200~${pasted}\x1b[201~`);
  await waitFor(() => app.frame().includes("Large input · 3 lines"));
  expect(app.frame().split("\n").length).toBeLessThanOrEqual(24);
  app.stdin.write("\r");
  await waitFor(() => runtime.sentMessages.length === 1);
  expect(runtime.sentMessages).toEqual([
    {content: pasted, displayContent: pasted}
  ]);
  app.unmount();
});

test("narrows the command menu while typing a slash command", async () => {
  const runtime = createScriptedRuntime();
  const app = renderApp(runtime);
  await app.ready();
  app.stdin.write("/");
  await waitFor(() => app.frame().includes("/learn"));
  expect(app.frame()).toContain("/test");
  app.stdin.write("le");
  await waitFor(() => !app.frame().includes("/test"));
  expect(app.frame()).toContain("/learn");
  app.unmount();
});

test("shows the approval dialog and resolves it from a keypress", async () => {
  const runtime = createScriptedRuntime();
  const app = renderApp(runtime);
  await app.ready();
  runtime.emit({
    type: "approval_requested",
    timestamp: new Date().toISOString(),
    request: {
      id: "approval-1",
      command: "localstorage-set",
      args: ["key", "value"]
    },
    reason:
      "The localstorage-set command can mutate browser or filesystem state"
  });
  await waitFor(() => app.frame().includes("approval needed"));
  expect(app.frame()).toContain("localstorage-set");
  app.stdin.write("n");
  await waitFor(() => !app.frame().includes("approval needed"));
  expect(runtime.approvals).toEqual([
    {requestId: "approval-1", approved: false}
  ]);
  app.unmount();
});

test("clears the transcript with /clear", async () => {
  const runtime = createScriptedRuntime({
    respond: () => [assistantReply("Scripted reply.")]
  });
  const app = renderApp(runtime);
  await app.ready();
  await submitInput(app, "remember this line");
  await waitFor(() => app.frame().includes("Scripted reply."));
  await submitInput(app, "/clear");
  await waitFor(() => !app.frame().includes("remember this line"));
  expect(app.frame()).not.toContain("Scripted reply.");
  app.unmount();
});

test("stops the runtime and exits with /quit", async () => {
  const runtime = createScriptedRuntime();
  const app = renderApp(runtime);
  await app.ready();
  await submitInput(app, "/quit");
  await waitFor(() => runtime.stopped());
  app.unmount();
});
