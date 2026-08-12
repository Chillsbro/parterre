import {expect, test} from "bun:test";
import type {AgentFactoryOptions} from "../../../src/runtime/index.js";
import {createCopilotAgent} from "../../../src/runtime/providers/createCopilotAgent.js";

test("aborts a Copilot turn, waits for settlement, and accepts the next turn", async () => {
  let settleActive = (): void => {};
  let abortCount = 0;
  const prompts: string[] = [];
  const session = {
    on() {},
    async sendAndWait({prompt}: {prompt: string}) {
      prompts.push(prompt);
      if (prompt === "keep working") {
        await new Promise<void>(resolve => {
          settleActive = resolve;
        });
      }
    },
    async abort() {
      abortCount += 1;
      settleActive();
    },
    async setModel() {},
    async disconnect() {}
  };
  class FakeCopilotClient {
    async start() {}
    async stop() {}
    async getAuthStatus() {
      return {isAuthenticated: true};
    }
    async createSession() {
      return session;
    }
    async listModels() {
      return [];
    }
  }
  class FakeToolSet {
    addCustom() {
      return this;
    }
  }
  const adapter = {
    approveAll: async () => ({kind: "approved" as const}),
    CopilotClient: FakeCopilotClient,
    defineTool: (_name: string, definition: unknown) => definition,
    ToolSet: FakeToolSet
  } as unknown as Pick<
    typeof import("@github/copilot-sdk"),
    "approveAll" | "CopilotClient" | "defineTool" | "ToolSet"
  >;
  const options: AgentFactoryOptions = {
    sessionId: "copilot-session",
    model: "auto",
    workspace: "/workspace",
    systemPromptAppend: "Use Parterre tools.",
    tools: [],
    handlers: {
      onAssistantDelta() {},
      onAssistantMessage() {},
      onSessionError() {}
    }
  };
  const agent = await createCopilotAgent(options, adapter);
  const activeTurn = agent.sendAndWait("keep working");
  while (prompts.length === 0)
    await new Promise(resolve => setTimeout(resolve, 0));

  expect(await agent.interrupt()).toBe(true);
  await activeTurn;
  expect(abortCount).toBe(1);

  await agent.sendAndWait("next task");
  expect(prompts).toEqual(["keep working", "next task"]);
  await agent.disconnect();
});
