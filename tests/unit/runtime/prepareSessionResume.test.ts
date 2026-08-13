import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {prepareSessionResume} from "../../../src/runtime/index.js";
import {
  appendSessionEvent,
  closeSessionDatabase,
  createSession
} from "../../../src/sessions/index.js";

test("builds a safe bounded resume plan from persisted session facts", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-resume-plan-"));
  try {
    await createSession(storageDir, {
      schemaVersion: 3,
      id: "resume-me",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      workspace: "/workspace",
      agent: "codex",
      model: "old-model",
      playwrightSession: "old-browser",
      status: "stopped",
      providerSessionId: "thread-1",
      resumeCount: 0
    });
    const events = [
      {
        type: "user_message" as const,
        timestamp: "2026-01-01T00:00:01.000Z",
        id: "u1",
        content: "open checkout"
      },
      {
        type: "agent_message" as const,
        timestamp: "2026-01-01T00:00:02.000Z",
        message: {
          type: "assistant_message" as const,
          id: "a1",
          content: "Checkout is open."
        }
      },
      {
        type: "approval_requested" as const,
        timestamp: "2026-01-01T00:00:03.000Z",
        request: {id: "approval-1", command: "upload", args: []},
        reason: "old pending approval"
      },
      {
        type: "playwright_finished" as const,
        timestamp: "2026-01-01T00:00:04.000Z",
        result: {
          request: {id: "goto-1", command: "goto", args: []},
          ok: true,
          output: "",
          artifacts: [],
          durationMs: 1,
          url: "https://shop.example/checkout"
        }
      },
      {
        type: "model_changed" as const,
        timestamp: "2026-01-01T00:00:05.000Z",
        model: "new-model"
      }
    ];
    for (const event of events) {
      await appendSessionEvent(storageDir, "resume-me", event, []);
    }

    const plan = await prepareSessionResume({
      storageDir,
      sessionId: "resume-me"
    });

    expect(plan).toMatchObject({
      model: "new-model",
      lastUrl: "https://shop.example/checkout",
      mode: "provider",
      history: [
        {role: "user", content: "open checkout"},
        {role: "assistant", content: "Checkout is open."}
      ]
    });
    expect(
      plan.displayEvents.some(event => event.type === "approval_requested")
    ).toBe(false);
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});

test("rejects unknown sessions and does not restore local file URLs", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-resume-plan-"));
  try {
    expect(
      prepareSessionResume({storageDir, sessionId: "missing"})
    ).rejects.toThrow("Unknown session");
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});

test("bounds fallback history without splitting a user-assistant pair", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-resume-plan-"));
  try {
    await createSession(storageDir, {
      schemaVersion: 2,
      id: "large-history",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      workspace: "/workspace",
      agent: "openai",
      model: "model",
      playwrightSession: "browser",
      status: "stopped",
      baseUrl: "http://localhost:11434/v1"
    });
    await appendSessionEvent(
      storageDir,
      "large-history",
      {
        type: "user_message",
        timestamp: "2026-01-01T00:00:01.000Z",
        id: "u1",
        content: "u".repeat(80_000)
      },
      []
    );
    await appendSessionEvent(
      storageDir,
      "large-history",
      {
        type: "agent_message",
        timestamp: "2026-01-01T00:00:02.000Z",
        message: {
          type: "assistant_message",
          id: "a1",
          content: "a".repeat(80_000)
        }
      },
      []
    );

    const plan = await prepareSessionResume({
      storageDir,
      sessionId: "large-history"
    });
    expect(plan.history.map(message => message.role)).toEqual([
      "user",
      "assistant"
    ]);
    expect(
      plan.history.reduce((size, message) => size + message.content.length, 0)
    ).toBe(100_000);
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});

test("reconstructs queued turns and groups multiple final assistant messages", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-resume-plan-"));
  try {
    await createSession(storageDir, {
      schemaVersion: 3,
      id: "queued-history",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      workspace: "/workspace",
      agent: "openai",
      model: "model",
      playwrightSession: "browser",
      status: "stopped",
      baseUrl: "http://localhost:11434/v1"
    });
    const events = [
      {
        type: "user_message" as const,
        timestamp: "1",
        id: "u1",
        content: "first"
      },
      {type: "agent_turn_started" as const, timestamp: "2", turnId: "u1"},
      {
        type: "user_message" as const,
        timestamp: "3",
        id: "u2",
        content: "second"
      },
      {type: "agent_turn_started" as const, timestamp: "4", turnId: "u2"},
      {
        type: "agent_message" as const,
        timestamp: "5",
        message: {
          type: "assistant_message" as const,
          id: "a1",
          content: "part one"
        }
      },
      {
        type: "agent_message" as const,
        timestamp: "6",
        message: {
          type: "assistant_message" as const,
          id: "a2",
          content: "part two"
        }
      },
      {type: "agent_turn_finished" as const, timestamp: "7", turnId: "u1"},
      {
        type: "agent_message" as const,
        timestamp: "8",
        message: {
          type: "assistant_message" as const,
          id: "a3",
          content: "second reply"
        }
      },
      {type: "agent_turn_finished" as const, timestamp: "9", turnId: "u2"}
    ];
    for (const event of events) {
      await appendSessionEvent(storageDir, "queued-history", event, []);
    }

    const plan = await prepareSessionResume({
      storageDir,
      sessionId: "queued-history"
    });
    expect(plan.history).toEqual([
      {role: "user", content: "first"},
      {role: "assistant", content: "part one\n\npart two"},
      {role: "user", content: "second"},
      {role: "assistant", content: "second reply"}
    ]);
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});
