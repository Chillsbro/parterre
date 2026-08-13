import {expect, test} from "bun:test";
import type {
  AgentFactory,
  AgentToolDefinition
} from "../../../src/runtime/index.js";
import {closeSessionDatabase} from "../../../src/sessions/index.js";
import {startRuntimeHarness} from "../../support/runtimeHarness.js";

test("interrupting denies a pending action and keeps the session usable", async () => {
  let active = false;
  let activeAbort: AbortController | undefined;
  let activeTurn: Promise<void> | undefined;
  let deniedResult: unknown;
  const factory: AgentFactory = async options => {
    const playwright = options.tools.find(
      tool => tool.name === "playwright_cli"
    ) as AgentToolDefinition;
    const run = async (prompt: string): Promise<void> => {
      const turnAbort = new AbortController();
      activeAbort = turnAbort;
      active = true;
      try {
        if (prompt === "clear cookies") {
          deniedResult = await playwright.handler(
            {
              command: "cookie-clear",
              args: []
            },
            {signal: turnAbort.signal}
          );
          return;
        }
        options.handlers.onAssistantMessage(
          "reply-after-interrupt",
          "Still here.",
          new Date().toISOString()
        );
      } finally {
        active = false;
        activeAbort = undefined;
      }
    };
    const send = (prompt: string): Promise<void> => {
      activeTurn = run(prompt);
      return activeTurn;
    };
    return {
      send,
      sendAndWait: send,
      async interrupt() {
        if (!active || !activeAbort || !activeTurn) return false;
        activeAbort.abort();
        await activeTurn;
        return true;
      },
      async listModels() {
        return [];
      },
      async setModel() {},
      async disconnect() {}
    };
  };
  const harness = await startRuntimeHarness({agentFactory: factory});
  try {
    const activeTurn = harness.controller.sendUserMessage("clear cookies");
    await harness.waitForEvent("approval_requested");

    expect(await harness.controller.interrupt()).toBe(true);
    await activeTurn;
    await harness.waitForEvent("agent_interrupted");
    expect(deniedResult).toEqual({ok: false, error: "User denied action"});

    await harness.controller.sendUserMessage("continue", true);
    await harness.waitForEvent(
      "agent_message",
      event =>
        event.message.type === "assistant_message" &&
        event.message.content === "Still here."
    );
  } finally {
    closeSessionDatabase(harness.config.storageDir);
    await harness.dispose();
  }
});
