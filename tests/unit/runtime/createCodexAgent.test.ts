import {expect, test} from "bun:test";
import type {ThreadEvent} from "@openai/codex-sdk";
import type {AgentFactoryOptions} from "../../../src/runtime/index.js";
import {createCodexAgent} from "../../../src/runtime/providers/createCodexAgent.js";

function events(items: ThreadEvent[]): AsyncIterable<ThreadEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    }
  };
}

function waitForAbort(signal: AbortSignal): AsyncIterable<ThreadEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      if (signal.aborted) throw new DOMException("Interrupted", "AbortError");
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Interrupted", "AbortError")),
          {once: true}
        );
      });
    }
  };
}

function createHarness(authenticated = true, blockFirstTurn = false) {
  const prompts: string[] = [];
  const messages: string[] = [];
  const clientOptions: unknown[] = [];
  const threadOptions: unknown[] = [];
  const resumedIds: string[] = [];
  const identities: unknown[] = [];
  let toolServerClosed = false;
  const turnSignals: AbortSignal[] = [];
  const options: AgentFactoryOptions = {
    sessionId: "session-codex",
    model: "auto",
    workspace: "/workspace",
    systemPromptAppend: "Use Parterre tools.",
    tools: [],
    handlers: {
      onAssistantDelta() {},
      onAssistantMessage: (_id, content) => messages.push(content),
      onSessionError() {},
      async onSessionIdentity(identity) {
        identities.push(identity);
      }
    }
  };
  const dependencies = {
    isAuthenticated: async () => authenticated,
    createClient: (clientOption: unknown) => {
      clientOptions.push(clientOption);
      const createThread = (threadOption: unknown) => {
        threadOptions.push(threadOption);
        return {
          id: null,
          async runStreamed(
            prompt: string,
            turnOptions?: {signal?: AbortSignal}
          ) {
            prompts.push(prompt);
            if (turnOptions?.signal) turnSignals.push(turnOptions.signal);
            if (
              blockFirstTurn &&
              prompt.includes("keep working") &&
              turnOptions?.signal
            ) {
              return {events: waitForAbort(turnOptions.signal)};
            }
            return {
              events: events([
                {type: "thread.started", thread_id: "thread-new"},
                {
                  type: "item.completed",
                  item: {id: "reply-1", type: "agent_message", text: "done"}
                },
                {
                  type: "turn.completed",
                  usage: {
                    input_tokens: 1,
                    cached_input_tokens: 0,
                    output_tokens: 1,
                    reasoning_output_tokens: 0
                  }
                }
              ])
            };
          }
        };
      };
      return {
        startThread: createThread,
        resumeThread: (id: string, threadOption: unknown) => {
          resumedIds.push(id);
          return createThread(threadOption);
        }
      };
    },
    startToolServer: async () => ({
      url: "http://127.0.0.1:1234/mcp",
      async close() {
        toolServerClosed = true;
      }
    })
  };
  return {
    options,
    dependencies,
    prompts,
    messages,
    clientOptions,
    threadOptions,
    resumedIds,
    identities,
    turnSignals,
    toolServerClosed: () => toolServerClosed
  };
}

test("rejects an unauthenticated Codex account before starting tools", async () => {
  const harness = createHarness(false);
  expect(
    createCodexAgent(harness.options, harness.dependencies)
  ).rejects.toThrow("codex login");
});

test("resumes a native Codex thread without reinjecting prior context", async () => {
  const harness = createHarness();
  harness.options.resume = {
    conversationId: "thread-existing",
    history: [{role: "user", content: "old request"}]
  };
  const agent = await createCodexAgent(harness.options, harness.dependencies);

  await agent.sendAndWait("continue");
  await agent.disconnect();

  expect(harness.resumedIds).toEqual(["thread-existing"]);
  expect(harness.prompts).toEqual(["continue"]);
  expect(harness.identities[0]).toEqual({
    provider: "codex",
    conversationId: "thread-existing"
  });
});

test("injects bounded history once when Codex has no native thread", async () => {
  const harness = createHarness();
  harness.options.resume = {
    history: [{role: "user", content: "old request"}]
  };
  const agent = await createCodexAgent(harness.options, harness.dependencies);

  await agent.sendAndWait("continue");
  await agent.sendAndWait("then summarize");
  await agent.disconnect();

  expect(harness.prompts[0]).toContain('"old request"');
  expect(harness.prompts[0]).toContain("Use Parterre tools.");
  expect(harness.prompts[1]).toBe("then summarize");
  expect(harness.identities).toContainEqual({
    provider: "codex",
    conversationId: "thread-new"
  });
});

test("cancels a queued Codex turn before it starts", async () => {
  const harness = createHarness(true, true);
  const agent = await createCodexAgent(harness.options, harness.dependencies);
  const activeTurn = agent.sendAndWait("keep working");

  expect(await agent.interrupt()).toBe(true);
  await activeTurn;
  expect(harness.turnSignals).toHaveLength(0);
  expect(await agent.interrupt()).toBe(false);

  await agent.sendAndWait("new task");
  expect(harness.messages).toEqual(["done"]);
  await agent.disconnect();
});

test("aborts an in-flight Codex turn and waits for it to settle", async () => {
  const harness = createHarness(true, true);
  const agent = await createCodexAgent(harness.options, harness.dependencies);
  const activeTurn = agent.sendAndWait("keep working");
  while (harness.turnSignals.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  expect(await agent.interrupt()).toBe(true);
  await activeTurn;
  expect(harness.turnSignals[0]?.aborted).toBe(true);
  expect(await agent.interrupt()).toBe(false);
  await agent.disconnect();
});

test("runs Codex with Parterre tools and existing authentication", async () => {
  const harness = createHarness();
  const agent = await createCodexAgent(harness.options, harness.dependencies);

  await agent.sendAndWait("inspect the page");
  await agent.sendAndWait("summarize it");
  await agent.disconnect();

  expect(harness.clientOptions).toEqual([
    {
      config: {
        mcp_servers: {
          parterre: {
            url: "http://127.0.0.1:1234/mcp",
            default_tools_approval_mode: "approve"
          }
        }
      }
    }
  ]);
  expect(harness.threadOptions).toEqual([
    {
      workingDirectory: "/workspace",
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "never"
    }
  ]);
  expect(harness.prompts).toEqual([
    "Use Parterre tools.\n\ninspect the page",
    "summarize it"
  ]);
  expect(harness.messages).toEqual(["done", "done"]);
  expect(harness.toolServerClosed()).toBe(true);
});
