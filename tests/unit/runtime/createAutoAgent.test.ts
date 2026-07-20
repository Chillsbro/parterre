import {expect, test} from "bun:test";
import {createAutoAgent} from "../../../src/runtime/providers/createAutoAgent.js";
import type {
  AgentFactoryOptions,
  AgentHandle
} from "../../../src/runtime/providers/index.js";

const options: AgentFactoryOptions = {
  sessionId: "session-auto",
  model: "auto",
  workspace: "/tmp",
  systemPromptAppend: "",
  tools: [],
  handlers: {
    onAssistantDelta() {},
    onAssistantMessage() {},
    onSessionError() {}
  }
};

const handle: AgentHandle = {
  async send() {},
  async sendAndWait() {},
  async listModels() {
    return [];
  },
  async setModel() {},
  async disconnect() {}
};

test("uses the first available authenticated provider", async () => {
  const attempted: string[] = [];
  const agent = await createAutoAgent(options, [
    {
      name: "first",
      load: async () => async () => {
        attempted.push("first");
        throw new Error("not authenticated");
      }
    },
    {
      name: "second",
      load: async () => async () => {
        attempted.push("second");
        return handle;
      }
    }
  ]);

  expect(agent).toBe(handle);
  expect(attempted).toEqual(["first", "second"]);
});

test("reports every unavailable provider", async () => {
  const start = () => Promise.reject(new Error("adapter missing"));

  expect(
    createAutoAgent(options, [
      {name: "Copilot", load: async () => start},
      {name: "Claude", load: async () => start}
    ])
  ).rejects.toThrow("Copilot: adapter missing\n  - Claude: adapter missing");
});
