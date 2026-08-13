import {expect, test} from "bun:test";
import type {AgentFactoryOptions} from "../../../src/runtime/index.js";
import {createClaudeAgent} from "../../../src/runtime/providers/createClaudeAgent.js";

test("interrupts a Claude turn at its result boundary and keeps the query alive", async () => {
  const prompts: string[] = [];
  let interruptCount = 0;
  let settleActive = (): void => {};
  let closed = false;
  const output: unknown[] = [];
  let wakeOutput = (): void => {};
  const pushOutput = (message: unknown): void => {
    output.push(message);
    wakeOutput();
  };
  const query = ({prompt}: {prompt: AsyncIterable<unknown>}) => {
    void (async () => {
      for await (const message of prompt) {
        const content = (message as {message: {content: string}}).message
          .content;
        prompts.push(content);
        if (content === "keep working") {
          await new Promise<void>(resolve => {
            settleActive = resolve;
          });
          pushOutput({type: "result", subtype: "error_during_execution"});
        } else {
          pushOutput({type: "result", subtype: "success"});
        }
      }
    })();
    return {
      async *[Symbol.asyncIterator]() {
        while (!closed || output.length > 0) {
          if (output.length === 0) {
            await new Promise<void>(resolve => {
              wakeOutput = resolve;
            });
          }
          const next = output.shift();
          if (next) yield next;
        }
      },
      async accountInfo() {
        return {email: "fixture@example.com"};
      },
      async interrupt() {
        interruptCount += 1;
        settleActive();
      },
      async supportedModels() {
        return [];
      },
      async setModel() {},
      close() {
        closed = true;
        settleActive();
        wakeOutput();
      }
    };
  };
  const adapter = {
    createSdkMcpServer: (server: unknown) => server,
    query,
    tool: (
      _name: string,
      _description: string,
      _schema: unknown,
      handler: unknown
    ) => handler
  } as unknown as Pick<
    typeof import("@anthropic-ai/claude-agent-sdk"),
    "createSdkMcpServer" | "query" | "tool"
  >;
  const errors: string[] = [];
  const options: AgentFactoryOptions = {
    sessionId: "claude-session",
    model: "auto",
    workspace: "/workspace",
    systemPromptAppend: "Use Parterre tools.",
    tools: [],
    handlers: {
      onAssistantDelta() {},
      onAssistantMessage() {},
      onSessionError: message => errors.push(message)
    }
  };
  const agent = await createClaudeAgent(options, adapter);
  const activeTurn = agent.sendAndWait("keep working");
  while (prompts.length === 0)
    await new Promise(resolve => setTimeout(resolve, 0));

  expect(await agent.interrupt()).toBe(true);
  await activeTurn;
  expect(interruptCount).toBe(1);
  expect(errors).toEqual([]);

  await agent.sendAndWait("next task");
  expect(prompts).toEqual(["keep working", "next task"]);
  await agent.disconnect();
});

test("settles a dequeued Claude prompt after cancelling its interrupted batch", async () => {
  const cancelledUuids: string[] = [];
  let closed = false;
  let wakeOutput = (): void => {};
  const query = ({prompt}: {prompt: AsyncIterable<unknown>}) => {
    const input = prompt[Symbol.asyncIterator]();
    return {
      async *[Symbol.asyncIterator]() {
        while (!closed) {
          await new Promise<void>(resolve => {
            wakeOutput = resolve;
          });
        }
      },
      async accountInfo() {
        return {email: "fixture@example.com"};
      },
      async interrupt() {
        const queued = (await input.next()).value as {uuid: string};
        return {still_queued: [queued.uuid]};
      },
      async cancelAsyncMessage(uuid: string) {
        cancelledUuids.push(uuid);
        return false;
      },
      async supportedModels() {
        return [];
      },
      async setModel() {},
      close() {
        closed = true;
        wakeOutput();
      }
    };
  };
  const adapter = {
    createSdkMcpServer: (server: unknown) => server,
    query,
    tool: (
      _name: string,
      _description: string,
      _schema: unknown,
      handler: unknown
    ) => handler
  } as unknown as Pick<
    typeof import("@anthropic-ai/claude-agent-sdk"),
    "createSdkMcpServer" | "query" | "tool"
  >;
  const options: AgentFactoryOptions = {
    sessionId: "claude-session",
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
  const agent = await createClaudeAgent(options, adapter);
  const queuedTurn = agent.sendAndWait("queued task");
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(await agent.interrupt()).toBe(true);
  await queuedTurn;
  expect(cancelledUuids).toHaveLength(1);

  await agent.disconnect();
});

test("resumes Claude natively and persists the initialized session identity", async () => {
  const prompts: string[] = [];
  const queryOptions: unknown[] = [];
  const identities: unknown[] = [];
  const output: unknown[] = [];
  let closed = false;
  let wake = (): void => {};
  const query = ({
    prompt,
    options
  }: {
    prompt: AsyncIterable<unknown>;
    options: unknown;
  }) => {
    queryOptions.push(options);
    output.push({
      type: "system",
      subtype: "init",
      session_id: "claude-authoritative",
      model: "claude-sonnet"
    });
    void (async () => {
      for await (const message of prompt) {
        prompts.push((message as {message: {content: string}}).message.content);
        output.push({type: "result", subtype: "success"});
        wake();
      }
    })();
    return {
      async *[Symbol.asyncIterator]() {
        while (!closed || output.length > 0) {
          if (output.length === 0) {
            await new Promise<void>(resolve => {
              wake = resolve;
            });
          }
          const next = output.shift();
          if (next) yield next;
        }
      },
      async accountInfo() {
        return {email: "fixture@example.com"};
      },
      async interrupt() {},
      async supportedModels() {
        return [];
      },
      async setModel() {},
      close() {
        closed = true;
        wake();
      }
    };
  };
  const adapter = {
    createSdkMcpServer: (server: unknown) => server,
    query,
    tool: (
      _name: string,
      _description: string,
      _schema: unknown,
      handler: unknown
    ) => handler
  } as unknown as Pick<
    typeof import("@anthropic-ai/claude-agent-sdk"),
    "createSdkMcpServer" | "query" | "tool"
  >;
  const options: AgentFactoryOptions = {
    sessionId: "parterre-session",
    model: "auto",
    workspace: "/workspace",
    systemPromptAppend: "Use Parterre tools.",
    resume: {
      conversationId: "claude-saved",
      history: [{role: "user", content: "old request"}]
    },
    tools: [],
    handlers: {
      onAssistantDelta() {},
      onAssistantMessage() {},
      onSessionError() {},
      async onSessionIdentity(identity) {
        identities.push(identity);
      }
    }
  };

  const agent = await createClaudeAgent(options, adapter);
  await agent.sendAndWait("continue");
  await agent.disconnect();

  expect(queryOptions[0]).toMatchObject({resume: "claude-saved"});
  expect(prompts).toEqual(["continue"]);
  expect(identities).toEqual([
    {
      provider: "claude",
      conversationId: "claude-authoritative",
      model: "claude-sonnet"
    }
  ]);
});
