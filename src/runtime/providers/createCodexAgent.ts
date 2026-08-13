import type {McpServer as McpServerType} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {WebStandardStreamableHTTPServerTransport as TransportType} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type {CodexOptions, ThreadEvent, ThreadOptions} from "@openai/codex-sdk";
import type {
  AgentFactoryOptions,
  AgentHandle,
  AgentToolDefinition
} from "./AgentProvider.js";
import {loadAdapterModule} from "./adapterModules.js";
import {
  bindToolsToActiveTurn,
  createAgentTurnQueue
} from "./createAgentTurnQueue.js";
import {formatResumedPrompt} from "./formatResumedPrompt.js";
import {isCodexAuthenticated} from "./isCodexAuthenticated.js";

interface ToolServer {
  url: string;
  close(): Promise<void>;
}

interface CodexThread {
  readonly id: string | null;
  runStreamed(
    prompt: string,
    options?: {signal?: AbortSignal}
  ): Promise<{events: AsyncIterable<ThreadEvent>}>;
}

interface CodexClient {
  startThread(options: ThreadOptions): CodexThread;
  resumeThread(id: string, options: ThreadOptions): CodexThread;
}

interface CodexAgentDependencies {
  isAuthenticated(): Promise<boolean>;
  createClient(options: CodexOptions): CodexClient;
  startToolServer(tools: AgentToolDefinition[]): Promise<ToolServer>;
}

function createMcpServer(
  tools: AgentToolDefinition[],
  McpServer: typeof McpServerType
): McpServerType {
  const server = new McpServer({name: "parterre", version: "0.1.0"});
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {description: tool.description, inputSchema: tool.schema},
      async input => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(await tool.handler(input)) ?? "null"
          }
        ]
      })
    );
  }
  return server;
}

async function startToolServer(
  tools: AgentToolDefinition[],
  McpServer: typeof McpServerType,
  Transport: typeof TransportType
): Promise<ToolServer> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const mcp = createMcpServer(tools, McpServer);
      const transport = new Transport({
        enableJsonResponse: true
      });
      await mcp.connect(transport);
      try {
        return await transport.handleRequest(request);
      } finally {
        await mcp.close();
      }
    }
  });
  return {
    url: `http://${server.hostname}:${server.port}/mcp`,
    async close() {
      await server.stop(true);
    }
  };
}

async function createDefaultDependencies(): Promise<CodexAgentDependencies> {
  const [{Codex}, {McpServer}, {WebStandardStreamableHTTPServerTransport}] =
    await Promise.all([
      loadAdapterModule<typeof import("@openai/codex-sdk")>(
        "@openai/codex-sdk"
      ),
      loadAdapterModule<
        typeof import("@modelcontextprotocol/sdk/server/mcp.js")
      >("@modelcontextprotocol/sdk/server/mcp.js"),
      loadAdapterModule<
        typeof import("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js")
      >("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js")
    ]);
  return {
    isAuthenticated: isCodexAuthenticated,
    createClient: options => new Codex(options),
    startToolServer: tools =>
      startToolServer(
        tools,
        McpServer,
        WebStandardStreamableHTTPServerTransport
      )
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createCodexAgent(
  options: AgentFactoryOptions,
  dependencies?: CodexAgentDependencies
): Promise<AgentHandle> {
  const resolvedDependencies =
    dependencies ?? (await createDefaultDependencies());
  if (!(await resolvedDependencies.isAuthenticated())) {
    throw new Error(
      "Not signed in to Codex. Run `codex login` outside Parterre, then start Parterre again."
    );
  }

  const turns = createAgentTurnQueue();
  const toolServer = await resolvedDependencies.startToolServer(
    bindToolsToActiveTurn(options.tools, turns)
  );
  let thread: CodexThread;
  try {
    const codex = resolvedDependencies.createClient({
      config: {
        mcp_servers: {
          parterre: {
            url: toolServer.url,
            default_tools_approval_mode: "approve"
          }
        }
      }
    });
    const threadOptions: ThreadOptions = {
      workingDirectory: options.workspace,
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "never",
      ...(options.model !== "auto" ? {model: options.model} : {})
    };
    thread = options.resume?.conversationId
      ? codex.resumeThread(options.resume.conversationId, threadOptions)
      : codex.startThread(threadOptions);
    if (options.resume?.conversationId) {
      await options.handlers.onSessionIdentity?.({
        provider: "codex",
        conversationId: options.resume.conversationId
      });
    }
  } catch (error) {
    await toolServer.close();
    throw error;
  }
  let firstTurn = !options.resume?.conversationId;
  let identityReported = Boolean(options.resume?.conversationId);

  const run = async (prompt: string, signal: AbortSignal): Promise<void> => {
    const resumedPrompt =
      firstTurn && options.resume
        ? formatResumedPrompt(prompt, options.resume.history)
        : prompt;
    const input = firstTurn
      ? `${options.systemPromptAppend}\n\n${resumedPrompt}`
      : resumedPrompt;
    firstTurn = false;
    const {events} = await thread.runStreamed(input, {signal});
    for await (const event of events) {
      const timestamp = new Date().toISOString();
      if (event.type === "thread.started" && !identityReported) {
        identityReported = true;
        await options.handlers.onSessionIdentity?.({
          provider: "codex",
          conversationId: event.thread_id
        });
      } else if (
        event.type === "item.completed" &&
        event.item.type === "agent_message"
      ) {
        options.handlers.onAssistantMessage(
          event.item.id,
          event.item.text,
          timestamp
        );
      } else if (event.type === "turn.failed") {
        throw new Error(event.error.message);
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  };

  const send = (prompt: string): Promise<void> =>
    turns.enqueue(signal => run(prompt, signal));

  return {
    async send(prompt: string): Promise<void> {
      await send(prompt).catch(error => {
        options.handlers.onSessionError(
          errorMessage(error),
          new Date().toISOString()
        );
      });
    },
    async sendAndWait(prompt: string): Promise<void> {
      await send(prompt);
    },
    interrupt: () => turns.interrupt(),
    async listModels() {
      return options.model === "auto"
        ? []
        : [{id: options.model, name: options.model}];
    },
    async setModel() {
      throw new Error(
        "Codex model changes require starting a new Parterre session."
      );
    },
    async disconnect(): Promise<void> {
      await turns.disconnect();
      await toolServer.close();
    }
  };
}
