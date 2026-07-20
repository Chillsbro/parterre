import {expect, test} from "bun:test";
import {z} from "zod";
import type {AgentFactoryOptions} from "../../../src/runtime/index.js";
import {createOpenAiAgent} from "../../../src/runtime/providers/createOpenAiAgent.js";

function sse(events: unknown[]): Response {
  const body = `${events
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: {"content-type": "text/event-stream"}
  });
}

function createHarness(completions: Response[]) {
  const deltas: string[] = [];
  const messages: string[] = [];
  const errors: string[] = [];
  const toolInputs: unknown[] = [];
  const completionBodies: {
    model: string;
    messages: {role: string; content?: string | null}[];
    tools: {function: {name: string}}[];
  }[] = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return Response.json({data: [{id: "llama3"}, {id: "qwen"}]});
    }
    completionBodies.push(JSON.parse(String(init?.body)));
    const next = completions.shift();
    if (!next) throw new Error("No scripted completion left");
    return next;
  }) as typeof fetch;
  const options: AgentFactoryOptions = {
    sessionId: "session-1",
    model: "auto",
    workspace: "/workspace",
    systemPromptAppend: "Use the tools.",
    baseUrl: "http://localhost:11434/v1/",
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
  return {
    options,
    fetchImpl,
    deltas,
    messages,
    errors,
    toolInputs,
    completionBodies
  };
}

test("streams deltas and finalizes the assistant reply", async () => {
  const harness = createHarness([
    sse([
      {choices: [{delta: {content: "Hel"}}]},
      {choices: [{delta: {content: "lo"}}]},
      {choices: [{delta: {}, finish_reason: "stop"}]}
    ])
  ]);
  const agent = await createOpenAiAgent(harness.options, harness.fetchImpl);
  await agent.sendAndWait("hi");
  expect(harness.deltas).toEqual(["Hel", "lo"]);
  expect(harness.messages).toEqual(["Hello"]);
  expect(harness.errors).toEqual([]);
  const body = harness.completionBodies[0];
  expect(body?.model).toBe("llama3");
  expect(body?.messages.map(message => message.role)).toEqual([
    "system",
    "user"
  ]);
  expect(body?.tools.map(tool => tool.function.name)).toEqual(["echo"]);
});

test("executes tool calls and feeds results back into the loop", async () => {
  const harness = createHarness([
    sse([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  function: {name: "echo", arguments: ""}
                }
              ]
            }
          }
        ]
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{index: 0, function: {arguments: '{"text":"hi"}'}}]
            }
          }
        ]
      }
    ]),
    sse([{choices: [{delta: {content: "done"}}]}])
  ]);
  const agent = await createOpenAiAgent(harness.options, harness.fetchImpl);
  await agent.sendAndWait("echo hi back");
  expect(harness.toolInputs).toEqual([{text: "hi"}]);
  expect(harness.messages).toEqual(["done"]);
  const secondBody = harness.completionBodies[1];
  const toolMessage = secondBody?.messages.find(
    message => message.role === "tool"
  );
  expect(toolMessage?.content).toBe(JSON.stringify({ok: true, echoed: true}));
});

test("resolves auto to the endpoint's first model and lists models", async () => {
  const harness = createHarness([]);
  const agent = await createOpenAiAgent(harness.options, harness.fetchImpl);
  expect(await agent.listModels()).toEqual([
    {id: "llama3", name: "llama3"},
    {id: "qwen", name: "qwen"}
  ]);
});

test("reports background send failures as session errors", async () => {
  const harness = createHarness([new Response("boom", {status: 500})]);
  const agent = await createOpenAiAgent(harness.options, harness.fetchImpl);
  await agent.send("hi");
  await new Promise(resolve => setTimeout(resolve, 1));
  expect(harness.errors).toHaveLength(1);
  expect(harness.errors[0]).toContain("500");
});
