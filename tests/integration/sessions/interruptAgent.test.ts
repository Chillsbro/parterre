import {expect, test} from "bun:test";
import type {AgentFactory} from "../../../src/runtime/index.js";
import {closeSessionDatabase} from "../../../src/sessions/index.js";
import {startRuntimeHarness} from "../../support/runtimeHarness.js";

test("interrupting an active turn keeps the session usable", async () => {
  let active = false;
  let activeAbort: AbortController | undefined;
  let activeTurn: Promise<void> | undefined;
  let markTurnStarted = (): void => {};
  const turnStarted = new Promise<void>(resolve => {
    markTurnStarted = resolve;
  });
  const factory: AgentFactory = async options => {
    const run = async (prompt: string): Promise<void> => {
      const turnAbort = new AbortController();
      activeAbort = turnAbort;
      active = true;
      try {
        if (prompt === "wait") {
          markTurnStarted();
          await new Promise<void>(resolve => {
            turnAbort.signal.addEventListener("abort", () => resolve(), {
              once: true
            });
          });
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
    const activeTurn = harness.controller.sendUserMessage("wait");
    await turnStarted;

    expect(await harness.controller.interrupt()).toBe(true);
    await activeTurn;
    await harness.waitForEvent("agent_interrupted");
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
