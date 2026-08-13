import {expect, test} from "bun:test";
import {mkdtemp, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  acquireSessionLease,
  appendSessionEvent,
  closeSessionDatabase,
  createSession,
  listSessions,
  readSessionEvents,
  removeSession,
  updateSessionStatus
} from "../../../src/sessions/index.js";

const metadata = {
  schemaVersion: 2 as const,
  id: "session-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  workspace: "workspace",
  agent: "github-copilot-sdk" as const,
  model: "auto",
  playwrightSession: "browser",
  status: "running" as const
};

test("persists replayable redacted session events in sqlite", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-"));
  try {
    await createSession(storageDir, metadata);
    await appendSessionEvent(
      storageDir,
      "session-1",
      {
        type: "user_message",
        timestamp: "2026-01-01T00:00:01.000Z",
        id: "message-1",
        content: "token=secret"
      },
      ["secret"]
    );
    expect(await readSessionEvents(storageDir, "session-1")).toEqual([
      {
        type: "user_message",
        timestamp: "2026-01-01T00:00:01.000Z",
        id: "message-1",
        content: "token=[REDACTED]"
      }
    ]);
    expect((await stat(join(storageDir, "parterre.db"))).isFile()).toBe(true);
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});

test("allows only one live owner to resume a session", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-"));
  try {
    await createSession(storageDir, metadata);
    const first = await acquireSessionLease(storageDir, metadata.id);
    expect(acquireSessionLease(storageDir, metadata.id)).rejects.toThrow(
      "already active"
    );
    await first.release();
    const second = await acquireSessionLease(storageDir, metadata.id);
    await second.release();
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});

test("refuses to delete a live leased session", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-"));
  try {
    await createSession(storageDir, metadata);
    const lease = await acquireSessionLease(storageDir, metadata.id);
    expect(removeSession(storageDir, metadata.id)).rejects.toThrow(
      "already active"
    );
    await lease.release();
    await removeSession(storageDir, metadata.id);
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});

test("lists, updates, and removes sessions", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-"));
  try {
    await createSession(storageDir, metadata);
    await createSession(storageDir, {
      ...metadata,
      id: "session-2",
      createdAt: "2026-01-02T00:00:00.000Z"
    });
    const listed = await listSessions(storageDir);
    expect(listed.map(session => session.id)).toEqual([
      "session-2",
      "session-1"
    ]);

    await updateSessionStatus(storageDir, "session-1", "stopped");
    const updated = await listSessions(storageDir);
    expect(updated.find(session => session.id === "session-1")?.status).toBe(
      "stopped"
    );

    await removeSession(storageDir, "session-1");
    expect((await listSessions(storageDir)).map(session => session.id)).toEqual(
      ["session-2"]
    );
    expect(await readSessionEvents(storageDir, "session-1")).toEqual([]);
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});
