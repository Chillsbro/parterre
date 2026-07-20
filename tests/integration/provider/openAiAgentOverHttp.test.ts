import {afterAll, beforeAll, expect, test} from "bun:test";
import {z} from "zod";
import type {AgentFactoryOptions} from "../../../src/runtime/index.js";
import {createOpenAiAgent} from "../../../src/runtime/providers/createOpenAiAgent.js";
import {
  type ChatCompletionsServer,
  startChatCompletionsServer
} from "../../support/chatCompletionsServer.js";
import {startRuntimeHarness} from "../../support/runtimeHarness.js";

const savedApiKey = process.env.OPENAI_API_KEY;
let server: ChatCompletionsServer;

beforeAll(() => {
  delete process.env.OPENAI_API_KEY;
  server = startChatCompletionsServer();
});

afterAll(() => {
  if (savedApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedApiKey;
  server.stop();
});

function createAgentHarness() {
  const deltas: string[] = [];
  const messages: string[] = [];
  const errors: string[] = [];
  const toolInputs: unknown[] = [];
  const options: AgentFactoryOptions = {
    sessionId: "session-http",
    model: "auto",
    workspace: "/workspace",
    systemPromptAppend: "Use the tools.",
    baseUrl: server.baseUrl,
    tools: [
      {
        name: "echo",
        description: "Echo the input",
        schema: {text: z.string()},
        handler: async input => {
          toolInputs.push(input);
          return {ok: true, echoed: true};
        }
      }
    ],
    handlers: {
      onAssistantDelta: (_id, delta) => deltas.push(delta),
      onAssistantMessage: (_id, content) => messages.push(content),
      onSessionError: message => errors.push(message)
    }
  };
  return {options, deltas, messages, errors, toolInputs};
}

test("streams deltas over a real socket and resolves auto to the served model", async () => {
  const requestsBefore = server.requests.length;
  server.script.push({deltas: ["Hel", "lo"]});
  const harness = createAgentHarness();
  const agent = await createOpenAiAgent(harness.options);
  await agent.sendAndWait("hi");
  expect(harness.deltas).toEqual(["Hel", "lo"]);
  expect(harness.messages).toEqual(["Hello"]);
  expect(harness.errors).toEqual([]);
  const request = server.requests[requestsBefore]!;
  expect(request.body.model).toBe("fixture-model");
  expect(request.body.stream).toBe(true);
  expect(request.authorization).toBeNull();
  await agent.disconnect();
});

test("round-trips tool calls over HTTP and feeds results back", async () => {
  const requestsBefore = server.requests.length;
  server.script.push(
    {toolCalls: [{name: "echo", arguments: {text: "hi"}}]},
    {deltas: ["done"]}
  );
  const harness = createAgentHarness();
  const agent = await createOpenAiAgent(harness.options);
  await agent.sendAndWait("echo hi back");
  expect(harness.toolInputs).toEqual([{text: "hi"}]);
  expect(harness.messages).toEqual(["done"]);
  const followUp = server.requests[requestsBefore + 1]!;
  const toolMessage = followUp.body.messages.find(
    message => message.role === "tool"
  );
  expect(toolMessage?.content).toBe(JSON.stringify({ok: true, echoed: true}));
  await agent.disconnect();
});

test("sends the bearer token from the environment", async () => {
  const requestsBefore = server.requests.length;
  process.env.OPENAI_API_KEY = "test-key-123";
  try {
    server.script.push({deltas: ["ok"]});
    const harness = createAgentHarness();
    const agent = await createOpenAiAgent(harness.options);
    await agent.sendAndWait("hi");
    expect(server.requests[requestsBefore]!.authorization).toBe(
      "Bearer test-key-123"
    );
    await agent.disconnect();
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test("surfaces HTTP failures as session errors", async () => {
  server.script.push({status: 500, body: "boom"});
  const harness = createAgentHarness();
  const agent = await createOpenAiAgent(harness.options);
  await agent.send("hi");
  const deadline = Date.now() + 5000;
  while (harness.errors.length === 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  expect(harness.errors).toHaveLength(1);
  expect(harness.errors[0]).toContain("500");
  await agent.disconnect();
});

test("drives the full runtime through the wire protocol", async () => {
  const requestsBefore = server.requests.length;
  server.script.push(
    {
      toolCalls: [
        {name: "playwright_cli", arguments: {command: "metrics", args: []}}
      ]
    },
    {deltas: ["That command is not allowed."]}
  );
  const runtime = await startRuntimeHarness({
    config: {provider: "openai", baseUrl: server.baseUrl, model: "auto"}
  });
  try {
    await runtime.controller.sendUserMessage("collect metrics", true);
    await runtime.waitForEvent(
      "agent_message",
      event => event.message.type === "assistant_message"
    );
    const lines = runtime
      .timeline()
      .map(item => `${item.kind}: ${item.content}`);
    expect(lines).toEqual([
      "user: collect metrics",
      "agent: That command is not allowed."
    ]);
    const followUp = server.requests[requestsBefore + 1]!;
    const toolMessage = followUp.body.messages.find(
      message => message.role === "tool"
    );
    expect(toolMessage?.content).toContain(
      "Unsupported Playwright command: metrics"
    );
  } finally {
    await runtime.dispose();
  }
});
