#!/usr/bin/env bun
import {createCliRenderer} from "@opentui/core";
import {createParterreTui} from "./app/index.js";
import {type AppConfig, loadCliCommand} from "./config/index.js";
import {printHelp} from "./help/index.js";
import {assertPlaywrightAvailable} from "./playwright/index.js";
import {printReplaySession} from "./replay/index.js";
import {resolveResumeConfig} from "./runtime/index.js";
import {
  getSession,
  listSessions,
  readSessionEvents,
  removeSession
} from "./sessions/index.js";
import {runSetupWizard} from "./setup/index.js";
import {probeTerminalGraphics} from "./terminal/index.js";
import {parterreTheme} from "./theme/index.js";
import {getParterreVersion, maybeUpdateParterre} from "./updating/index.js";

async function main(): Promise<void> {
  const argv = Bun.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "-v" || argv[0] === "--v")) {
    process.stdout.write(`${await getParterreVersion()}\n`);
    return;
  }
  if (await maybeUpdateParterre()) return;
  const command = loadCliCommand(argv);
  if (command.name === "help") {
    printHelp();
    return;
  }
  if (command.name === "setup") {
    await runSetupWizard();
    return;
  }
  if (command.name === "sessions") {
    const sessions = await listSessions(command.storageDir);
    if (sessions.length === 0) {
      process.stdout.write("No saved sessions.\n");
      return;
    }
    for (const session of sessions) {
      process.stdout.write(
        `${session.id}\t${session.status}\t${session.createdAt}\t${session.workspace}\n`
      );
    }
    return;
  }
  if (command.name === "replay") {
    const events = await readSessionEvents(
      command.storageDir,
      command.sessionId
    );
    printReplaySession(command.sessionId, events);
    return;
  }
  if (command.name === "delete") {
    await removeSession(command.storageDir, command.sessionId);
    process.stdout.write(`Deleted session ${command.sessionId}.\n`);
    return;
  }
  const resumeMetadata =
    command.name === "resume"
      ? await getSession(command.storageDir, command.sessionId)
      : undefined;
  let config: AppConfig;
  if (command.name === "resume") {
    if (!resumeMetadata) {
      throw new Error(`Unknown session: ${command.sessionId}`);
    }
    config = resolveResumeConfig({
      metadata: resumeMetadata,
      model: resumeMetadata.model,
      storageDir: command.storageDir,
      playwrightCommand: command.playwrightCommand,
      redactions: command.redactions,
      baseUrl: command.baseUrl,
      allowUnverifiedRedactions: command.allowUnverifiedRedactions
    });
  } else {
    config = command.config;
  }
  await assertPlaywrightAvailable(config.playwrightCommand);
  const graphics = await probeTerminalGraphics();
  const renderer = await createCliRenderer({
    stdin: process.stdin,
    stdout: process.stdout,
    exitOnCtrlC: false,
    screenMode: "alternate-screen",
    useMouse: true,
    targetFps: 30,
    maxFps: 60,
    backgroundColor: parterreTheme.background,
    consoleMode: "disabled"
  });
  const app = createParterreTui({
    config,
    resumeSessionId: command.name === "resume" ? command.sessionId : undefined,
    graphics,
    renderer,
    stdout: process.stdout
  });
  await app.waitUntilExit();
}

await main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
