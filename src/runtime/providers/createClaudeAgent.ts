import type {SDKUserMessage} from "@anthropic-ai/claude-agent-sdk";
import type {AgentFactoryOptions, AgentHandle} from "./AgentProvider.js";
import {loadAdapterModule} from "./adapterModules.js";
import {isClaudeAuthenticated} from "./isClaudeAuthenticated.js";

const mcpServerName = "parterre";

export async function createClaudeAgent(
  options: AgentFactoryOptions
): Promise<AgentHandle> {
  const {createSdkMcpServer, query, tool} = await loadAdapterModule<
    typeof import("@anthropic-ai/claude-agent-sdk")
  >("@anthropic-ai/claude-agent-sdk");
  const server = createSdkMcpServer({
    name: mcpServerName,
    version: "0.1.0",
    tools: options.tools.map(definition =>
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

  const queue: SDKUserMessage[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  async function* userMessages(): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      if (queue.length === 0) {
        await new Promise<void>(resolve => {
          wake = resolve;
        });
      }
      const next = queue.shift();
      if (next) yield next;
    }
  }
  const push = (prompt: string): void => {
    queue.push({
      type: "user",
      message: {role: "user", content: prompt},
      parent_tool_use_id: null,
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
      allowedTools: options.tools.map(
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

  let resultWaiters: Array<() => void> = [];
  const settleWaiters = (): void => {
    const waiters = resultWaiters;
    resultWaiters = [];
    for (const resolve of waiters) resolve();
  };

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
          settleWaiters();
          if (message.subtype !== "success") {
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
      settleWaiters();
    }
  })();

  return {
    async send(prompt: string): Promise<void> {
      push(prompt);
    },
    async sendAndWait(prompt: string): Promise<void> {
      const done = new Promise<void>(resolve => {
        resultWaiters.push(resolve);
      });
      push(prompt);
      await done;
    },
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
      await consume.catch(() => {});
    }
  };
}
