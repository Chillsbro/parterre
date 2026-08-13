import {expect, test} from "bun:test";
import {formatTimelineItem} from "../../../src/replay/index.js";
import {buildTimelineItems} from "../../../src/transcript/index.js";

test("combines streamed main-agent messages for the transcript", () => {
  const items = buildTimelineItems([
    {
      type: "agent_message",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: {type: "assistant_delta", id: "reply-1", delta: "Opening "}
    },
    {
      type: "agent_message",
      timestamp: "2026-01-01T00:00:00.001Z",
      message: {type: "assistant_delta", id: "reply-1", delta: "the page."}
    }
  ]);

  expect(items).toEqual([
    {id: "reply-1", kind: "agent", content: "Opening the page."}
  ]);
});

test("renders agent errors as error items", () => {
  const items = buildTimelineItems([
    {
      type: "agent_message",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: {type: "error", message: "model unavailable"}
    }
  ]);

  expect(items).toEqual([
    {
      id: "2026-01-01T00:00:00.000Z-agent-error",
      kind: "error",
      content: "model unavailable"
    }
  ]);
});

test("renders an intentional agent interruption as a tool event", () => {
  const items = buildTimelineItems([
    {
      type: "agent_interrupted",
      timestamp: "2026-01-01T00:00:00.000Z",
      turnId: "turn-1"
    }
  ]);

  expect(items).toEqual([
    {
      id: "turn-1-interrupted",
      kind: "tool",
      content: "Agent interrupted",
      ok: true
    }
  ]);
});

test("renders the durable resume mode and browser recovery", () => {
  expect(
    buildTimelineItems([
      {
        type: "session_resumed",
        timestamp: "2026-01-01T00:00:00.000Z",
        provider: "codex",
        mode: "provider",
        browser: "session"
      }
    ])
  ).toEqual([
    {
      id: "2026-01-01T00:00:00.000Z-resumed",
      kind: "tool",
      content: "Session resumed with codex",
      detail: "provider context, session browser restore",
      ok: true
    }
  ]);
});

test("shows an authenticated browser-state warning before restore", () => {
  expect(
    buildTimelineItems([
      {
        type: "browser_restore_warning",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: "Authenticated state may be restored."
      }
    ])
  ).toEqual([
    {
      id: "2026-01-01T00:00:00.000Z-browser-restore-warning",
      kind: "tool",
      content: "Browser profile restore warning",
      detail: "Authenticated state may be restored.",
      ok: false
    }
  ]);
});

test("adds a filesystem link after a video recording finishes", () => {
  const items = buildTimelineItems([
    {
      type: "playwright_finished",
      timestamp: "2026-01-01T00:00:00.000Z",
      result: {
        request: {id: "recording-1", command: "video-stop", args: []},
        ok: true,
        output: "- [Video](recording.webm)",
        artifacts: ["/tmp/parterre recording.webm"],
        durationMs: 123
      }
    }
  ]);

  expect(items).toEqual([
    {
      id: "recording-1",
      kind: "tool",
      content: "video-stop",
      detail: "123ms",
      ok: true
    },
    {
      id: "recording-1-/tmp/parterre recording.webm",
      kind: "tool",
      content: "Video recorded — view ",
      link: {
        label: "here",
        href: "file:///tmp/parterre%20recording.webm"
      },
      ok: true
    }
  ]);
});

test("links a materialized target test with its conventional exit code", () => {
  const items = buildTimelineItems([
    {
      type: "target_test_finished",
      timestamp: "2026-01-01T00:00:00.000Z",
      result: {
        ok: true,
        passed: true,
        path: "/tmp/target/tests/checkout.test.ts",
        command: ["bun", "run", "test"],
        exitCode: 0,
        timedOut: false,
        stdout: "pass",
        stderr: ""
      }
    }
  ]);

  expect(items).toEqual([
    {
      id: "2026-01-01T00:00:00.000Z-target-test",
      kind: "tool",
      content: "Automation test written — view ",
      detail: "exit 0",
      link: {
        label: "/tmp/target/tests/checkout.test.ts",
        href: "file:///tmp/target/tests/checkout.test.ts"
      },
      ok: true
    }
  ]);
});

test("links ordinary workspace files after they are written", () => {
  const items = buildTimelineItems([
    {
      type: "workspace_file_finished",
      timestamp: "2026-01-01T00:00:00.000Z",
      result: {
        ok: true,
        path: "/tmp/target/src/greeting.ts",
        relativePath: "src/greeting.ts",
        created: true,
        changed: true,
        bytes: 32
      }
    }
  ]);

  expect(items).toEqual([
    {
      id: "2026-01-01T00:00:00.000Z-workspace-file",
      kind: "tool",
      content: "Workspace file created — view ",
      detail: "32 bytes",
      link: {
        label: "src/greeting.ts",
        href: "file:///tmp/target/src/greeting.ts"
      },
      ok: true
    }
  ]);
});

test("formats timeline items as replay lines", () => {
  expect(formatTimelineItem({id: "1", kind: "user", content: "hi"})).toBe(
    "You: hi"
  );
  expect(formatTimelineItem({id: "2", kind: "agent", content: "done"})).toBe(
    "Agent: done"
  );
  expect(formatTimelineItem({id: "3", kind: "error", content: "boom"})).toBe(
    "Error: boom"
  );
  expect(
    formatTimelineItem({
      id: "4",
      kind: "tool",
      content: "open",
      detail: "12ms",
      ok: false
    })
  ).toBe("ERROR open (12ms)");
  expect(
    formatTimelineItem({
      id: "5",
      kind: "tool",
      content: "Video recorded — view ",
      link: {label: "here", href: "file:///tmp/recording.webm"},
      ok: true
    })
  ).toBe(
    "OK Video recorded — view \u001B]8;;file:///tmp/recording.webm\u0007here\u001B]8;;\u0007"
  );
});
