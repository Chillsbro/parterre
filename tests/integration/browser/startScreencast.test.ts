import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  closePlaywrightSession,
  executePlaywrightRequest
} from "../../../src/playwright/index.js";
import {startScreencast} from "../../../src/runtime/index.js";
import {
  closeSessionDatabase,
  createSession
} from "../../../src/sessions/index.js";
import {startFixtureServer} from "../../support/fixtureServer.js";

test("streams live frames from the session browser", async () => {
  const fixture = startFixtureServer();
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-screencast-"));
  const workspace = resolve(".");
  const playwrightSession = `screencast-${Date.now()}`;
  const command =
    process.platform === "win32"
      ? resolve("node_modules", ".bin", "playwright-cli.cmd")
      : resolve("node_modules", ".bin", "playwright-cli");
  const frames: string[] = [];
  let handle: Awaited<ReturnType<typeof startScreencast>> | undefined;
  try {
    await createSession(storageDir, {
      schemaVersion: 2,
      id: "session-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspace,
      agent: "github-copilot-sdk",
      model: "auto",
      playwrightSession,
      status: "running"
    });
    const openResult = await executePlaywrightRequest({
      command,
      workspace,
      playwrightSession,
      storageDir,
      sessionId: "session-1",
      request: {
        id: "open-1",
        command: "open",
        args: [`${fixture.url}/animated`]
      }
    });
    expect(openResult.ok).toBe(true);
    handle = await startScreencast({
      storageDir,
      sessionId: "session-1",
      onFrame: path => frames.push(path),
      onEnd: () => {}
    });
    await new Promise(resolvePause => setTimeout(resolvePause, 2500));
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(await Bun.file(frames.at(-1)!).exists()).toBe(true);

    handle.stop();
    await new Promise(resolvePause => setTimeout(resolvePause, 500));
    const pngFrames: string[] = [];
    handle = await startScreencast({
      storageDir,
      sessionId: "session-1",
      format: "png",
      onFrame: path => pngFrames.push(path),
      onEnd: () => {}
    });
    await new Promise(resolvePause => setTimeout(resolvePause, 2500));
    expect(pngFrames.length).toBeGreaterThanOrEqual(1);
    const lastFrame = pngFrames.at(-1)!;
    expect(lastFrame.endsWith(".png")).toBe(true);
    const bytes = new Uint8Array(await Bun.file(lastFrame).arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([137, 80, 78, 71]);
  } finally {
    handle?.stop();
    await closePlaywrightSession({command, workspace, playwrightSession});
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
    fixture.stop();
  }
}, 60000);
