#!/usr/bin/env bun
import {render} from "ink";
import {App} from "./app/index.js";
import {loadCliCommand} from "./config/index.js";
import {printHelp} from "./help/index.js";
import {assertPlaywrightAvailable} from "./playwright/index.js";
import {printReplaySession} from "./replay/index.js";
import {
  listSessions,
  readSessionEvents,
  removeSession
} from "./sessions/index.js";
import {runSetupWizard} from "./setup/index.js";
import {createMouseStdin, probeTerminalGraphics} from "./terminal/index.js";
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
  await assertPlaywrightAvailable(command.config.playwrightCommand);
  const graphics = await probeTerminalGraphics();
  const mouse = createMouseStdin(process.stdin, process.stdout);
  mouse.enableTracking();
  process.on("exit", mouse.disableTracking);
  const app = render(
    <App
      config={command.config}
      graphics={graphics}
      subscribeWheel={mouse.subscribeWheel}
    />,
    {
      exitOnCtrlC: false,
      stdin: mouse.stdin
    }
  );
  try {
    await app.waitUntilExit();
  } finally {
    mouse.disableTracking();
    mouse.detach();
  }
}

await main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
