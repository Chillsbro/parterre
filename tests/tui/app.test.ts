import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {createTestRenderer} from "@opentui/core/testing";
import {createParterreTui} from "../../src/app/index.js";
import type {AppConfig} from "../../src/config/index.js";
import type {
  FramePainter,
  FrameRegion,
  TerminalGraphicsInfo
} from "../../src/terminal/index.js";
import {
  assistantReply,
  createScriptedRuntime,
  type ScriptedRuntime
} from "../support/scriptedRuntime.js";

const graphics: TerminalGraphicsInfo = {
  cellWidth: 10,
  cellHeight: 20,
  terminalWidth: 1000,
  terminalHeight: 480,
  supportsKittyGraphics: false
};

async function createConfig(): Promise<AppConfig> {
  return {
    provider: "copilot",
    workspace: resolve("."),
    model: "auto",
    storageDir: await mkdtemp(join(tmpdir(), "parterre-tui-")),
    playwrightCommand: "playwright-cli",
    redactions: []
  };
}

async function renderApp(
  runtime: ScriptedRuntime,
  options: {
    graphics?: TerminalGraphicsInfo;
    createPainter?: () => FramePainter;
  } = {}
) {
  const config = await createConfig();
  const setup = await createTestRenderer({width: 100, height: 24});
  const app = createParterreTui({
    config,
    graphics: options.graphics ?? graphics,
    renderer: setup.renderer,
    createRuntime: runtime.createRuntime,
    createPainter: options.createPainter ?? false,
    skipStartup: true
  });
  const frame = async (): Promise<string> => {
    await new Promise<void>(resolveWait => setTimeout(resolveWait, 5));
    await setup.renderOnce();
    return setup.captureCharFrame();
  };
  await frame();
  return {
    ...setup,
    app,
    config,
    frame,
    async close() {
      await app.stop();
      await rm(config.storageDir, {recursive: true, force: true});
    }
  };
}

function frameRows(frame: string): string[] {
  return (frame.endsWith("\n") ? frame.slice(0, -1) : frame).split("\n");
}

test("explains the Kitty requirement when live frames are unavailable", async () => {
  const runtime = createScriptedRuntime();
  const app = await renderApp(runtime);
  try {
    const frame = await app.frame();
    expect(frame).toContain("Live browser frames require Kitty graphics");
    expect(frame).toContain("(Ghostty or");
    expect(frame).toContain("Kitty).");
    expect(runtime.liveFramesEnabled()).toBe(false);
  } finally {
    await app.close();
  }
});

test("renders a scripted exchange in the transcript", async () => {
  const runtime = createScriptedRuntime({
    respond: () => [assistantReply("Scripted reply.")]
  });
  const app = await renderApp(runtime);
  try {
    await app.mockInput.typeText("hello there");
    app.mockInput.pressEnter();
    const frame = await app.frame();
    expect(frame).toContain("you hello there");
    expect(frame).toContain("Scripted reply.");
    expect(runtime.sentMessages).toEqual([
      {content: "hello there", displayContent: "hello there"}
    ]);
  } finally {
    await app.close();
  }
});

test("keeps oddly spaced pasted code compact and submits it unchanged", async () => {
  const runtime = createScriptedRuntime();
  const app = await renderApp(runtime);
  try {
    const pasted = `const value = 1;\n\n${" ".repeat(40)}return value;`;
    await app.mockInput.pasteBracketedText(pasted);
    const frame = await app.frame();
    expect(frame).toContain("Large input · 3 lines");
    expect(frameRows(frame)).toHaveLength(24);
    app.mockInput.pressEnter();
    await app.frame();
    expect(runtime.sentMessages).toEqual([
      {content: pasted, displayContent: pasted}
    ]);
  } finally {
    await app.close();
  }
});

test("expands the composer as typed text wraps", async () => {
  const runtime = createScriptedRuntime();
  const app = await renderApp(runtime);
  try {
    await app.mockInput.typeText("expandme".repeat(13));
    const frame = await app.frame();
    expect(
      frameRows(frame).filter(line => line.includes("expandme")).length
    ).toBeGreaterThan(1);
    expect(frameRows(frame)).toHaveLength(24);
  } finally {
    await app.close();
  }
});

test("narrows the command menu while typing a slash command", async () => {
  const runtime = createScriptedRuntime();
  const app = await renderApp(runtime);
  try {
    await app.mockInput.typeText("/");
    expect(await app.frame()).toContain("/test");
    await app.mockInput.typeText("le");
    const frame = await app.frame();
    expect(frame).toContain("/learn");
    expect(frame).not.toContain("/test");
  } finally {
    await app.close();
  }
});

test("shows ordinary approvals and resolves them from a keypress", async () => {
  const runtime = createScriptedRuntime();
  const app = await renderApp(runtime);
  try {
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
    expect(await app.frame()).toContain("approval needed");
    app.mockInput.pressKey("n");
    expect(await app.frame()).not.toContain("approval needed");
    expect(runtime.approvals).toEqual([
      {requestId: "approval-1", approved: false}
    ]);
  } finally {
    await app.close();
  }
});

test("live browser frames bypass OpenTUI and diff review suspends the painter", async () => {
  const runtime = createScriptedRuntime();
  const regions: Array<FrameRegion | undefined> = [];
  const frames: string[] = [];
  let repaints = 0;
  const painter: FramePainter = {
    submitFrame: path => frames.push(path),
    setRegion: region => regions.push(region),
    suspend: () => regions.push(undefined),
    resume: () => {},
    repaint: () => {
      repaints += 1;
    },
    stop: () => {}
  };
  const app = await renderApp(runtime, {
    graphics: {...graphics, supportsKittyGraphics: true},
    createPainter: () => painter
  });
  try {
    const beforeFrameId = app.renderer.frameId;
    expect(runtime.liveFramesEnabled()).toBe(true);
    runtime.emitNotification({type: "liveFrame", path: "/tmp/frame.png"});
    expect(frames).toEqual(["/tmp/frame.png"]);
    expect(app.renderer.frameId).toBe(beforeFrameId);

    runtime.emitNotification({
      type: "workspaceReview",
      review: {
        requestId: "workspace-approval-1",
        action: "replace",
        path: "/workspace/README.md",
        relativePath: "README.md",
        bytes: 13,
        before: "# Old\n",
        after: "# New README\n"
      }
    });
    runtime.emit({
      type: "approval_requested",
      timestamp: new Date().toISOString(),
      request: {
        id: "workspace-approval-1",
        command: "write-workspace-file",
        args: ["README.md"]
      },
      reason: "Replace workspace file README.md (13 bytes)"
    });
    const review = await app.frame();
    expect(review).toContain("replace README.md");
    expect(review).toContain("# New README");
    expect(review).not.toContain("◌ browser");
    expect(regions.at(-1)).toBeUndefined();

    app.mockInput.pressKey("y");
    const restored = await app.frame();
    expect(restored).toContain("◌ browser");
    expect(runtime.approvals).toEqual([
      {requestId: "workspace-approval-1", approved: true}
    ]);
    expect(regions.at(-1)).toEqual(expect.objectContaining({width: 56}));
    expect(repaints).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});

test("interrupts an active agent turn with Escape", async () => {
  const runtime = createScriptedRuntime();
  const app = await renderApp(runtime);
  try {
    runtime.emit({
      type: "agent_turn_started",
      timestamp: new Date().toISOString(),
      turnId: "active-turn"
    });
    expect(await app.frame()).toContain("Thinking");
    app.mockInput.pressEscape();
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
    const frame = await app.frame();
    expect(runtime.interruptionCount()).toBe(1);
    expect(frame).toContain("Agent interrupted");
    expect(frame).not.toContain("Thinking");
  } finally {
    await app.close();
  }
});

test("clears the transcript and exits through local commands", async () => {
  const runtime = createScriptedRuntime({
    respond: () => [assistantReply("Scripted reply.")]
  });
  const app = await renderApp(runtime);
  try {
    await app.mockInput.typeText("remember this line");
    app.mockInput.pressEnter();
    expect(await app.frame()).toContain("Scripted reply.");
    await app.mockInput.typeText("/clear");
    app.mockInput.pressEnter();
    const cleared = await app.frame();
    expect(cleared).not.toContain("remember this line");
    expect(cleared).not.toContain("Scripted reply.");
    await app.mockInput.typeText("/quit");
    app.mockInput.pressEnter();
    await app.app.waitUntilExit();
    expect(runtime.stopped()).toBe(true);
  } finally {
    await rm(app.config.storageDir, {recursive: true, force: true});
  }
});
