import {expect, test} from "bun:test";
import {selectAgentActivity} from "../../../src/app/selectors/index.js";
import {
  type AppState,
  appReducer,
  initialAppState
} from "../../../src/app/state/index.js";
import type {SessionEvent} from "../../../src/sessions/index.js";

function stateFromEvents(events: SessionEvent[]) {
  return events.reduce<AppState>(
    (state, event) => appReducer(state, {type: "event", event}),
    {...initialAppState, status: "running"}
  );
}

test("describes active browser work", () => {
  const state = stateFromEvents([
    {
      type: "user_message",
      timestamp: "2026-01-01T00:00:00.000Z",
      id: "user-1",
      content: "Open the page"
    },
    {
      type: "agent_turn_started",
      timestamp: "2026-01-01T00:00:00.050Z",
      turnId: "user-1"
    },
    {
      type: "playwright_started",
      timestamp: "2026-01-01T00:00:00.100Z",
      request: {id: "request-1", command: "open", args: []}
    }
  ]);
  expect(selectAgentActivity(state, "copilot")).toBe("Using browser / open");
});

test("labels startup with the configured provider", () => {
  expect(selectAgentActivity(initialAppState, "claude")).toBe(
    "Connecting to Claude Code"
  );
  expect(selectAgentActivity(initialAppState, "copilot")).toBe(
    "Connecting to Copilot"
  );
});

test("falls back to thinking once browser work finishes", () => {
  const request = {id: "request-1", command: "open", args: []};
  const state = stateFromEvents([
    {
      type: "user_message",
      timestamp: "2026-01-01T00:00:00.000Z",
      id: "user-1",
      content: "Open the page"
    },
    {
      type: "agent_turn_started",
      timestamp: "2026-01-01T00:00:00.050Z",
      turnId: "user-1"
    },
    {
      type: "playwright_started",
      timestamp: "2026-01-01T00:00:00.100Z",
      request
    },
    {
      type: "playwright_finished",
      timestamp: "2026-01-01T00:00:00.200Z",
      result: {
        request,
        ok: true,
        output: "done",
        artifacts: [],
        durationMs: 100
      }
    }
  ]);
  expect(selectAgentActivity(state, "copilot")).toBe("Thinking");
});

test("returns nothing after the agent turn finishes", () => {
  const state = stateFromEvents([
    {
      type: "user_message",
      timestamp: "2026-01-01T00:00:00.000Z",
      id: "user-1",
      content: "Open the page"
    },
    {
      type: "agent_turn_started",
      timestamp: "2026-01-01T00:00:00.500Z",
      turnId: "user-1"
    },
    {
      type: "agent_message",
      timestamp: "2026-01-01T00:00:01.000Z",
      message: {type: "assistant_message", id: "assistant-1", content: "Done"}
    },
    {
      type: "agent_turn_finished",
      timestamp: "2026-01-01T00:00:01.100Z",
      turnId: "user-1"
    }
  ]);
  expect(selectAgentActivity(state, "copilot")).toBeUndefined();
});
