import {expect, test} from "bun:test";
import {appReducer, initialAppState} from "../../../src/app/state/index.js";

test("tracks approval state from canonical events", () => {
  const request = {
    id: "request-1",
    command: "eval",
    args: ["() => document.title"]
  };
  const requestedState = appReducer(initialAppState, {
    type: "event",
    event: {
      type: "approval_requested",
      timestamp: "2026-01-01T00:00:00.000Z",
      request,
      reason: "Sensitive"
    }
  });
  expect(requestedState.pendingApproval?.request.id).toBe("request-1");
  const resolvedState = appReducer(requestedState, {
    type: "event",
    event: {
      type: "approval_resolved",
      timestamp: "2026-01-01T00:00:01.000Z",
      requestId: "request-1",
      approved: false
    }
  });
  expect(resolvedState.pendingApproval).toBeUndefined();
});

test("toggles embedded browser focus", () => {
  const focusedState = appReducer(initialAppState, {
    type: "toggleBrowserFocus"
  });
  expect(focusedState.browserFocused).toBe(true);
});

test("tracks latest page, screenshot, model, and error incrementally", () => {
  const request = {id: "request-1", command: "open", args: []};
  const state = [
    {
      type: "playwright_finished" as const,
      timestamp: "2026-01-01T00:00:00.000Z",
      result: {
        request,
        ok: true,
        output: "",
        artifacts: ["/tmp/shot.png"],
        durationMs: 10,
        url: "https://example.com/",
        title: "Example Domain"
      }
    },
    {
      type: "playwright_finished" as const,
      timestamp: "2026-01-01T00:00:01.000Z",
      result: {
        request: {id: "request-2", command: "eval", args: []},
        ok: true,
        output: "",
        artifacts: [],
        durationMs: 10
      }
    },
    {
      type: "model_changed" as const,
      timestamp: "2026-01-01T00:00:02.000Z",
      model: "gpt-5"
    },
    {
      type: "process_error" as const,
      timestamp: "2026-01-01T00:00:03.000Z",
      source: "agent" as const,
      message: "boom"
    }
  ].reduce(
    (current, event) => appReducer(current, {type: "event", event}),
    initialAppState
  );
  expect(state.latestPageUrl).toBe("https://example.com/");
  expect(state.latestPageTitle).toBe("Example Domain");
  expect(state.latestScreenshot).toBe("/tmp/shot.png");
  expect(state.currentModel).toBe("gpt-5");
  expect(state.lastProcessError).toBe("boom");
  const cleared = appReducer(state, {type: "clearEvents"});
  expect(cleared.latestPageUrl).toBeUndefined();
  expect(cleared.latestScreenshot).toBeUndefined();
  expect(cleared.lastProcessError).toBeUndefined();
  expect(cleared.currentModel).toBe("gpt-5");
});

test("clears the transcript but keeps model changes", () => {
  const withEvents = [
    {
      type: "user_message" as const,
      timestamp: "2026-01-01T00:00:00.000Z",
      id: "message-1",
      content: "hello"
    },
    {
      type: "model_changed" as const,
      timestamp: "2026-01-01T00:00:01.000Z",
      model: "gpt-5"
    }
  ].reduce(
    (state, event) => appReducer(state, {type: "event", event}),
    initialAppState
  );
  const cleared = appReducer(withEvents, {type: "clearEvents"});
  expect(cleared.events).toEqual([
    {
      type: "model_changed",
      timestamp: "2026-01-01T00:00:01.000Z",
      model: "gpt-5"
    }
  ]);
});
