import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  closeSessionDatabase,
  listSessions,
  readSessionEvents
} from "../../../src/sessions/index.js";
import {startRuntimeHarness} from "../../support/runtimeHarness.js";
import {createScriptedAgent} from "../../support/scriptedAgent.js";

test("continues one durable session without replaying an unresolved approval", async () => {
  const storageDir = await mkdtemp(
    join(tmpdir(), "parterre-resume-integration-")
  );
  const originalAgent = createScriptedAgent([
    {steps: [{reply: "I remember the checkout."}]}
  ]);
  const original = await startRuntimeHarness({
    agentFactory: originalAgent.factory,
    config: {storageDir}
  });
  let resumed: Awaited<ReturnType<typeof startRuntimeHarness>> | undefined;
  try {
    await original.controller.sendUserMessage("open checkout", true);
    await original.controller.setModel("scripted-model");
    const liveSession = (await listSessions(storageDir))[0]!;
    expect(
      startRuntimeHarness({
        agentFactory: createScriptedAgent().factory,
        resumeSessionId: liveSession.id,
        config: {storageDir, workspace: resolve(".")}
      })
    ).rejects.toThrow("already active");
    await original.controller.stop();
    closeSessionDatabase(storageDir);
    const session = (await listSessions(storageDir))[0]!;
    closeSessionDatabase(storageDir);

    const resumedAgent = createScriptedAgent([
      {steps: [{reply: "Continuing the checkout."}]}
    ]);
    resumed = await startRuntimeHarness({
      agentFactory: resumedAgent.factory,
      resumeSessionId: session.id,
      config: {
        storageDir,
        workspace: resolve("."),
        model: session.model
      }
    });
    await resumed.controller.sendUserMessage("continue", true);
    await resumed.controller.stop();

    const sessions = await listSessions(storageDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: session.id,
      status: "stopped",
      model: "scripted-model",
      resumeCount: 1
    });
    const persisted = await readSessionEvents(storageDir, session.id);
    expect(
      persisted.filter(event => event.type === "session_resumed")
    ).toHaveLength(1);
    expect(
      persisted
        .filter(event => event.type === "user_message")
        .map(event => (event.type === "user_message" ? event.content : ""))
    ).toEqual(["open checkout", "continue"]);
    expect(resumedAgent.prompts).toEqual(["continue"]);
    expect(
      resumed.events.some(event => event.type === "approval_requested")
    ).toBe(false);
  } finally {
    closeSessionDatabase(storageDir);
    await resumed?.dispose();
    await original.dispose();
    await rm(storageDir, {recursive: true, force: true});
  }
}, 60_000);

test("explicitly resumes a legacy session without verifiable redactions", async () => {
  const storageDir = await mkdtemp(
    join(tmpdir(), "parterre-legacy-resume-integration-")
  );
  const originalAgent = createScriptedAgent([]);
  const original = await startRuntimeHarness({
    agentFactory: originalAgent.factory,
    config: {storageDir}
  });
  let resumed: Awaited<ReturnType<typeof startRuntimeHarness>> | undefined;
  try {
    await original.controller.stop();
    const session = (await listSessions(storageDir))[0]!;
    closeSessionDatabase(storageDir);
    const database = new (await import("bun:sqlite")).Database(
      join(storageDir, "parterre.db")
    );
    database
      .query(
        "UPDATE sessions SET schemaVersion = 2, redactionVerifiers = NULL WHERE id = $id"
      )
      .run({$id: session.id});
    database.close();

    resumed = await startRuntimeHarness({
      agentFactory: createScriptedAgent([]).factory,
      resumeSessionId: session.id,
      config: {
        storageDir,
        workspace: resolve("."),
        allowUnverifiedRedactions: true
      }
    });
    expect(resumed.statuses.at(-1)).toBe("running");
  } finally {
    await resumed?.dispose();
    await original.dispose();
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
}, 60_000);
