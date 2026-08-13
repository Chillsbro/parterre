import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {startChatCompletionsServer} from "../../support/chatCompletionsServer.js";
import {playwrightCliPath} from "../../support/runtimeHarness.js";

const escapeChar = String.fromCharCode(27);
const bellChar = String.fromCharCode(7);
const csiSequence = new RegExp(`${escapeChar}\\[[0-9;?]*[a-zA-Z]`, "g");
const oscSequence = new RegExp(
  `${escapeChar}\\][^${bellChar}]*${bellChar}`,
  "g"
);

function stripAnsi(text: string): string {
  return text.replaceAll(csiSequence, "").replaceAll(oscSequence, "");
}

function interactiveTerminalEnv(): Record<string, string | undefined> {
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (
      key === "CI" ||
      key === "CONTINUOUS_INTEGRATION" ||
      key === "BUILD_NUMBER" ||
      key === "GITHUB_ACTIONS" ||
      key === "RUN_ID" ||
      key.startsWith("CI_")
    ) {
      delete env[key];
    }
  }
  return env;
}

test("boots the real binary in a pty and exits cleanly on /quit", async () => {
  const server = startChatCompletionsServer();
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-pty-"));
  const workspace = await mkdtemp(join(tmpdir(), "parterre-pty-workspace-"));
  let output = "";
  const terminal = new Bun.Terminal({
    cols: 120,
    rows: 32,
    data(_terminal, chunk) {
      output += new TextDecoder().decode(chunk);
    }
  });
  const subprocess = Bun.spawn({
    cmd: [
      process.execPath,
      "src/cli.ts",
      "run",
      "--provider",
      "openai",
      "--base-url",
      server.baseUrl,
      "--storage",
      storageDir,
      "--workspace",
      workspace,
      "--playwright",
      playwrightCliPath()
    ],
    cwd: resolve("."),
    terminal,
    env: {
      ...interactiveTerminalEnv(),
      PARTERRE_SKIP_PROBE: "1",
      PARTERRE_REDUCE_MOTION: "1"
    }
  });
  try {
    const deadline = Date.now() + 30000;
    while (
      !stripAnsi(output).includes("Describe a task") &&
      Date.now() < deadline
    ) {
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    expect(stripAnsi(output)).toContain("Describe a task");

    await new Promise(resolveWait => setTimeout(resolveWait, 300));
    terminal.write("/quit");
    const echoed = Date.now() + 5000;
    while (!stripAnsi(output).includes("/quit") && Date.now() < echoed) {
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
    }
    terminal.write("\r");

    const exitCode = await Promise.race([
      subprocess.exited,
      new Promise<never>((_resolveExit, rejectExit) =>
        setTimeout(
          () => rejectExit(new Error("Timed out waiting for exit")),
          20000
        )
      )
    ]);
    expect(exitCode).toBe(0);
  } finally {
    subprocess.kill();
    terminal.close();
    server.stop();
    await rm(storageDir, {recursive: true, force: true});
    await rm(workspace, {recursive: true, force: true});
  }
}, 60000);
