import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  closePlaywrightSession,
  createPlaywrightExecutor,
  executePlaywrightRequest,
  getRequestedArtifactPath,
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
    const videoStartRequest = {
      id: "record-fixture",
      command: "video-start",
      args: ["outside-the-session.webm", "--size", "640x480"]
    };
    const videoRecordingPath = getRequestedArtifactPath(
      storageDir,
      "session-1",
      videoStartRequest
    );
    const videoStartResult = await executor(videoStartRequest, {
      videoRecordingPath
    });
    expect(videoStartResult.ok).toBe(true);
    const recordedNavigationResult = await executor({
      id: "recorded-navigation",
      command: "goto",
      args: [`${fixture.url}/form`]
    });
    expect(recordedNavigationResult.ok).toBe(true);
    const videoStopResult = await executor(
      {id: "finish-recording", command: "video-stop", args: []},
      {videoRecordingPath}
    );
    expect(videoStopResult.ok).toBe(true);
    const videoArtifacts = videoStopResult.artifacts.filter(artifact =>
      artifact.endsWith(".webm")
    );
    expect(videoArtifacts).toHaveLength(1);
    expect(videoArtifacts[0]).not.toContain("outside-the-session");
    expect(await Bun.file(videoArtifacts[0]!).exists()).toBe(true);
    expect(
      (await Bun.file(videoArtifacts[0]!).arrayBuffer()).byteLength
    ).toBeGreaterThan(0);
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
}, 60000);
