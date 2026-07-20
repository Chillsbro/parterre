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

function createHarness(authenticated = true) {
  const prompts: string[] = [];
  const messages: string[] = [];
  const clientOptions: unknown[] = [];
  const threadOptions: unknown[] = [];
  let toolServerClosed = false;
  const options: AgentFactoryOptions = {
    sessionId: "session-codex",
    model: "auto",
    workspace: "/workspace",
    systemPromptAppend: "Use Parterre tools.",
    tools: [],
    handlers: {
      onAssistantDelta() {},
      onAssistantMessage: (_id, content) => messages.push(content),
      onSessionError() {}
    }
  };
  const dependencies = {
    isAuthenticated: async () => authenticated,
    createClient: (clientOption: unknown) => {
      clientOptions.push(clientOption);
      return {
        startThread(threadOption: unknown) {
          threadOptions.push(threadOption);
          return {
            async runStreamed(prompt: string) {
              prompts.push(prompt);
              return {
                events: events([
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
    toolServerClosed: () => toolServerClosed
  };
}

test("rejects an unauthenticated Codex account before starting tools", async () => {
  const harness = createHarness(false);
  expect(
    createCodexAgent(harness.options, harness.dependencies)
  ).rejects.toThrow("codex login");
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
        mcp_servers: {parterre: {url: "http://127.0.0.1:1234/mcp"}}
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
