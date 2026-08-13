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

function createHarness(completions: Array<Response | "wait-for-abort">) {
  const deltas: string[] = [];
  const messages: string[] = [];
  const errors: string[] = [];
  const toolInputs: unknown[] = [];
  const identities: unknown[] = [];
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
    if (next === "wait-for-abort") {
      return await new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException("Interrupted", "AbortError"));
          return;
        }
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Interrupted", "AbortError")),
          {once: true}
        );
      });
    }
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
      onSessionError: message => errors.push(message),
      async onSessionIdentity(identity) {
        identities.push(identity);
      }
    }
  };
  return {
    options,
    fetchImpl,
    deltas,
    messages,
    errors,
    toolInputs,
    identities,
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

test("seeds OpenAI-compatible history and persists the resolved model", async () => {
  const harness = createHarness([
    sse([{choices: [{delta: {content: "continued"}}]}])
  ]);
  harness.options.resume = {
    history: [
      {role: "user", content: "old request"},
      {role: "assistant", content: "old answer"}
    ]
  };
  const agent = await createOpenAiAgent(harness.options, harness.fetchImpl);

  await agent.sendAndWait("continue");

  expect(
    harness.completionBodies[0]?.messages.map(message => message.role)
  ).toEqual(["system", "user", "assistant", "user"]);
  expect(harness.identities).toEqual([{provider: "openai", model: "llama3"}]);
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

test("interrupts only the active OpenAI-compatible turn", async () => {
  const harness = createHarness([
    sse([{choices: [{delta: {content: "next reply"}}]}])
  ]);
  const agent = await createOpenAiAgent(harness.options, harness.fetchImpl);
  const activeTurn = agent.sendAndWait("keep working");

  expect(await agent.interrupt()).toBe(true);
  await activeTurn;
  expect(await agent.interrupt()).toBe(false);
  expect(harness.errors).toEqual([]);

  await agent.sendAndWait("new task");
  expect(harness.messages).toEqual(["next reply"]);
});

test("aborts an OpenAI-compatible request already in flight", async () => {
  const harness = createHarness(["wait-for-abort"]);
  const agent = await createOpenAiAgent(harness.options, harness.fetchImpl);
  const activeTurn = agent.sendAndWait("keep working");
  while (harness.completionBodies.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  expect(await agent.interrupt()).toBe(true);
  await activeTurn;
  expect(harness.errors).toEqual([]);
});

test("rolls back partial tool-call history when interrupted", async () => {
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
                  function: {name: "echo", arguments: '{"text":"one"}'}
                },
                {
                  index: 1,
                  id: "call-2",
                  function: {name: "echo", arguments: '{"text":"two"}'}
                }
              ]
            }
          }
        ]
      }
    ]),
    sse([{choices: [{delta: {content: "next reply"}}]}])
  ]);
  let toolStarted = false;
  harness.options.tools[0]!.handler = async (_input, context) => {
    toolStarted = true;
    const signal = context?.signal;
    if (!signal) throw new Error("Expected a turn signal");
    if (signal.aborted) throw new DOMException("Interrupted", "AbortError");
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Interrupted", "AbortError")),
        {once: true}
      );
    });
  };
  const agent = await createOpenAiAgent(harness.options, harness.fetchImpl);
  const activeTurn = agent.sendAndWait("run both tools");
  while (!toolStarted) await new Promise(resolve => setTimeout(resolve, 0));

  expect(await agent.interrupt()).toBe(true);
  await activeTurn;
  await agent.sendAndWait("new task");

  expect(
    harness.completionBodies[1]?.messages.map(message => message.role)
  ).toEqual(["system", "user"]);
  expect(harness.messages).toEqual(["next reply"]);
});
