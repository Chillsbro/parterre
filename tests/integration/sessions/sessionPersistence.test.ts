import {expect, test} from "bun:test";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {formatTimelineItem} from "../../../src/replay/index.js";
import {
  closeSessionDatabase,
  getSessionPath,
  listSessions,
  readSessionEvents,
  removeSession
} from "../../../src/sessions/index.js";
import {buildTimelineItems} from "../../../src/transcript/index.js";
import {startRuntimeHarness} from "../../support/runtimeHarness.js";
import {createScriptedAgent} from "../../support/scriptedAgent.js";

test("persists what the user saw across a database reopen, with secrets redacted", async () => {
  const agent = createScriptedAgent([
    {steps: [{reply: "Noted, keeping that safe."}]}
  ]);
  const harness = await startRuntimeHarness({
    agentFactory: agent.factory,
    config: {redactions: ["hunter2"]}
  });
  const storageDir = harness.config.storageDir;
  try {
    await harness.controller.sendUserMessage("my token is hunter2", true);
    await harness.waitForEvent(
      "agent_message",
      event => event.message.type === "assistant_message"
    );
    await harness.controller.setModel("fixture-model");
    await harness.waitForEvent("model_changed");
    await harness.controller.stop();
    expect(harness.statuses.at(-1)).toBe("stopped");

    const sessions = await listSessions(storageDir);
    expect(sessions).toHaveLength(1);
    const session = sessions[0]!;
    expect(session.status).toBe("stopped");
    expect(session.model).toBe("auto");

    const persisted = await readSessionEvents(storageDir, session.id);
    expect(persisted.some(event => event.type === "session_started")).toBe(
      true
    );
    expect(persisted.some(event => event.type === "session_stopped")).toBe(
      true
    );
    expect(JSON.stringify(persisted)).not.toContain("hunter2");

    const lines = buildTimelineItems(persisted).map(formatTimelineItem);
    expect(lines).toEqual([
      "You: my token is [REDACTED]",
      "Agent: Noted, keeping that safe.",
      "OK model → fixture-model"
    ]);
  } finally {
    closeSessionDatabase(storageDir);
    await harness.dispose();
  }
});

test("delete removes the session rows and its artifacts on disk", async () => {
  const agent = createScriptedAgent([{steps: [{reply: "Hello."}]}]);
  const harness = await startRuntimeHarness({agentFactory: agent.factory});
  const storageDir = harness.config.storageDir;
  try {
    await harness.controller.sendUserMessage("hi", true);
    await harness.waitForEvent(
      "agent_message",
      event => event.message.type === "assistant_message"
    );
    await harness.controller.stop();

    const session = (await listSessions(storageDir))[0]!;
    const sessionDir = getSessionPath(storageDir, session.id);
    await mkdir(sessionDir, {recursive: true});
    await writeFile(join(sessionDir, "artifact.png"), "fake image");

    await removeSession(storageDir, session.id);
    expect(await listSessions(storageDir)).toHaveLength(0);
    expect(await readSessionEvents(storageDir, session.id)).toHaveLength(0);
    expect(await Bun.file(join(sessionDir, "artifact.png")).exists()).toBe(
      false
    );
  } finally {
    closeSessionDatabase(storageDir);
    await harness.dispose();
  }
});

test("a stopped runtime leaves no unredacted trace of repeated secrets", async () => {
  const agent = createScriptedAgent([
    {steps: [{reply: "Used the token twice: hunter2 and hunter2."}]}
  ]);
  const harness = await startRuntimeHarness({
    agentFactory: agent.factory,
    config: {redactions: ["hunter2"]}
  });
  const storageDir = harness.config.storageDir;
  try {
    await harness.controller.sendUserMessage("use hunter2 twice", true);
    await harness.waitForEvent(
      "agent_message",
      event => event.message.type === "assistant_message"
    );
    await harness.controller.stop();
    const session = (await listSessions(storageDir))[0]!;
    const persisted = await readSessionEvents(storageDir, session.id);
    expect(JSON.stringify(persisted)).not.toContain("hunter2");
    const agentLine = buildTimelineItems(persisted)
      .map(formatTimelineItem)
      .find(line => line.startsWith("Agent:"));
    expect(agentLine).toBe(
      "Agent: Used the token twice: [REDACTED] and [REDACTED]."
    );
  } finally {
    closeSessionDatabase(storageDir);
    await harness.dispose();
  }
});
