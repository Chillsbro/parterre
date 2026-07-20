import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  closePlaywrightSession,
  createPlaywrightExecutor,
  executePlaywrightRequest,
  isPlaywrightSessionOpen
} from "../../../src/playwright/index.js";
import {
  closeSessionDatabase,
  createSession
} from "../../../src/sessions/index.js";
import {startFixtureServer} from "../../support/fixtureServer.js";

test("executes an isolated Playwright CLI browser action", async () => {
  const fixture = startFixtureServer();
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-integration-"));
  const workspace = resolve(".");
  const playwrightSession = `integration-${Date.now()}`;
  const command =
    process.platform === "win32"
      ? resolve("node_modules", ".bin", "playwright-cli.cmd")
      : resolve("node_modules", ".bin", "playwright-cli");
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
    const result = await executePlaywrightRequest({
      command,
      workspace,
      playwrightSession,
      storageDir,
      sessionId: "session-1",
      request: {
        id: "open-fixture",
        command: "open",
        args: [`${fixture.url}/`]
      }
    });
    expect(result.ok).toBe(true);
    expect(result.url).toBe(`${fixture.url}/`);
    expect(result.title).toBe("Parterre Fixture Home");
    const executor = createPlaywrightExecutor({
      command,
      workspace,
      playwrightSession,
      storageDir,
      sessionId: "session-1"
    });
    const frameResult = await executor({
      id: `${result.request.id}-frame`,
      command: "screenshot",
      args: ["--hires"]
    });
    expect(frameResult.ok).toBe(true);
    expect(frameResult.artifacts).toHaveLength(1);
    expect(await Bun.file(frameResult.artifacts[0]!).exists()).toBe(true);
    const screenshotResult = await executePlaywrightRequest({
      command,
      workspace,
      playwrightSession,
      storageDir,
      sessionId: "session-1",
      request: {
        id: "capture-fixture",
        command: "screenshot",
        args: ["--filename=C:\\outside.png"]
      }
    });
    expect(screenshotResult.ok).toBe(true);
    expect(screenshotResult.artifacts).toHaveLength(1);
    expect(await Bun.file(screenshotResult.artifacts[0]!).exists()).toBe(true);
    expect(
      await isPlaywrightSessionOpen({command, workspace, playwrightSession})
    ).toBe(true);
    await closePlaywrightSession({command, workspace, playwrightSession});
    expect(
      await isPlaywrightSessionOpen({command, workspace, playwrightSession})
    ).toBe(false);
  } finally {
    await closePlaywrightSession({command, workspace, playwrightSession});
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
    fixture.stop();
  }
});
