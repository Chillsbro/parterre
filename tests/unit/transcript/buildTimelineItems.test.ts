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
});
