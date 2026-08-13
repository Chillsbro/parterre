import {randomUUID} from "node:crypto";
import type {SDKUserMessage} from "@anthropic-ai/claude-agent-sdk";
import type {AgentFactoryOptions, AgentHandle} from "./AgentProvider.js";
import {loadAdapterModule} from "./adapterModules.js";
import {
  bindToolsToActiveTurn,
  createAgentTurnQueue
} from "./createAgentTurnQueue.js";
import {isClaudeAuthenticated} from "./isClaudeAuthenticated.js";

const mcpServerName = "parterre";

export async function createClaudeAgent(
  options: AgentFactoryOptions,
  adapter?: Pick<
    typeof import("@anthropic-ai/claude-agent-sdk"),
    "createSdkMcpServer" | "query" | "tool"
  >
): Promise<AgentHandle> {
  const {createSdkMcpServer, query, tool} =
    adapter ??
    (await loadAdapterModule<typeof import("@anthropic-ai/claude-agent-sdk")>(
      "@anthropic-ai/claude-agent-sdk"
    ));
  const turns = createAgentTurnQueue();
  const tools = bindToolsToActiveTurn(options.tools, turns);
  const server = createSdkMcpServer({
    name: mcpServerName,
    version: "0.1.0",
    tools: tools.map(definition =>
      tool(
        definition.name,
        definition.description,
        definition.schema,
        async input => ({
          content: [
            {
              type: "text",
              text: JSON.stringify(await definition.handler(input))
            }
          ]
        })
      )
    )
  });

  const inputQueue: SDKUserMessage[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  async function* userMessages(): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      if (inputQueue.length === 0) {
        await new Promise<void>(resolve => {
          wake = resolve;
        });
      }
      const next = inputQueue.shift();
      if (next) yield next;
    }
  }
  const push = (prompt: string, uuid: ReturnType<typeof randomUUID>): void => {
    inputQueue.push({
      type: "user",
      message: {role: "user", content: prompt},
      parent_tool_use_id: null,
      uuid,
      session_id: ""
    });
    wake?.();
    wake = undefined;
  };

  const agentQuery = query({
    prompt: userMessages(),
    options: {
      cwd: options.workspace,
      ...(options.model !== "auto" ? {model: options.model} : {}),
      mcpServers: {[mcpServerName]: server},
      tools: [],
      allowedTools: tools.map(
        definition => `mcp__${mcpServerName}__${definition.name}`
      ),
      permissionMode: "bypassPermissions",
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: options.systemPromptAppend
      }
    }
  });

  const account = await agentQuery.accountInfo().catch(() => undefined);
  if (!isClaudeAuthenticated(account, process.env.ANTHROPIC_API_KEY)) {
    agentQuery.close();
    throw new Error(
      "Not signed in to Claude. Run `claude` and use /login to sign in — a Claude subscription is required (or set ANTHROPIC_API_KEY) — then start Parterre again."
    );
  }

  let settleCurrentTurn: (() => void) | undefined;
  let currentTurnSignal: AbortSignal | undefined;
  let currentTurnMessageUuid: ReturnType<typeof randomUUID> | undefined;

  const consume = (async () => {
    try {
      for await (const message of agentQuery) {
        const timestamp = new Date().toISOString();
        if (message.type === "assistant") {
          const text = message.message.content
            .flatMap(block => (block.type === "text" ? [block.text] : []))
            .join("");
          if (text)
            options.handlers.onAssistantMessage(message.uuid, text, timestamp);
        } else if (message.type === "result") {
          settleCurrentTurn?.();
          if (message.subtype !== "success" && !currentTurnSignal?.aborted) {
            options.handlers.onSessionError(
              `Claude session ended: ${message.subtype.replaceAll("_", " ")}`,
              timestamp
            );
          }
        }
      }
    } catch (error) {
      options.handlers.onSessionError(
        error instanceof Error ? error.message : String(error),
        new Date().toISOString()
      );
    } finally {
      settleCurrentTurn?.();
    }
  })();

  const send = (prompt: string): Promise<void> =>
    turns.enqueue(async signal => {
      currentTurnSignal = signal;
      currentTurnMessageUuid = randomUUID();
      const done = new Promise<void>(resolve => {
        settleCurrentTurn = resolve;
      });
      push(prompt, currentTurnMessageUuid);
      await done;
      settleCurrentTurn = undefined;
      currentTurnSignal = undefined;
      currentTurnMessageUuid = undefined;
    });

  const interruptClaude = async (): Promise<void> => {
    const messageUuid = currentTurnMessageUuid;
    const receipt = await agentQuery.interrupt();
    if (!messageUuid || !receipt?.still_queued?.includes(messageUuid)) return;
    const queryWithCancellation = agentQuery as typeof agentQuery & {
      cancelAsyncMessage(uuid: string): Promise<boolean>;
    };
    await queryWithCancellation.cancelAsyncMessage(messageUuid);
    settleCurrentTurn?.();
  };

  return {
    async send(prompt: string): Promise<void> {
      await send(prompt);
    },
    async sendAndWait(prompt: string): Promise<void> {
      await send(prompt);
    },
    interrupt: () => turns.interrupt(interruptClaude),
    async listModels() {
      const models = await agentQuery.supportedModels();
      return models.map(model => ({id: model.value, name: model.displayName}));
    },
    async setModel(modelId: string): Promise<void> {
      await agentQuery.setModel(modelId);
    },
    async disconnect(): Promise<void> {
      closed = true;
      wake?.();
      agentQuery.close();
      await turns.disconnect();
      await consume.catch(() => {});
    }
  };
}
