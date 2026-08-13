import {randomUUID} from "node:crypto";
import type {CopilotClient as CopilotClientType} from "@github/copilot-sdk";
import {z} from "zod";
import type {AgentFactoryOptions, AgentHandle} from "./AgentProvider.js";
import {loadAdapterModule} from "./adapterModules.js";
import {
  bindToolsToActiveTurn,
  createAgentTurnQueue
} from "./createAgentTurnQueue.js";
import {formatResumedPrompt} from "./formatResumedPrompt.js";
import {isCliStartTimeout} from "./isCliStartTimeout.js";

const maxStartAttempts = 3;

async function startCopilotClient(
  workspace: string,
  CopilotClient: typeof CopilotClientType
): Promise<CopilotClientType> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxStartAttempts; attempt++) {
    const client = new CopilotClient({workingDirectory: workspace});
    try {
      await client.start();
      return client;
    } catch (error) {
      lastError = error;
      await client.stop().catch(() => {});
      if (!isCliStartTimeout(error) || attempt === maxStartAttempts) break;
    }
  }
  if (isCliStartTimeout(lastError)) {
    throw new Error(
      "The Copilot CLI did not start in time. If macOS asked for your keychain password, approve it (choose “Always Allow” to avoid repeat prompts) and start Parterre again."
    );
  }
  throw lastError;
}

export async function createCopilotAgent(
  options: AgentFactoryOptions,
  adapter?: Pick<
    typeof import("@github/copilot-sdk"),
    "approveAll" | "CopilotClient" | "defineTool" | "ToolSet"
  >
): Promise<AgentHandle> {
  const {approveAll, CopilotClient, defineTool, ToolSet} =
    adapter ??
    (await loadAdapterModule<typeof import("@github/copilot-sdk")>(
      "@github/copilot-sdk"
    ));
  const turns = createAgentTurnQueue();
  const tools = bindToolsToActiveTurn(options.tools, turns);
  const client = await startCopilotClient(options.workspace, CopilotClient);
  try {
    const authStatus = await client.getAuthStatus();
    if (!authStatus.isAuthenticated) {
      throw new Error(
        "Not signed in to GitHub Copilot" +
          (authStatus.statusMessage ? ` (${authStatus.statusMessage})` : "") +
          ". Run `bunx @github/copilot` and use /login to sign in — an active Copilot subscription is required (or set GH_TOKEN) — then start Parterre again."
      );
    }
    const sessionConfig = {
      model: options.model,
      streaming: true,
      tools: tools.map(definition =>
        defineTool(definition.name, {
          description: definition.description,
          parameters: z.object(definition.schema),
          defer: "never",
          skipPermission: true,
          handler: input => definition.handler(input)
        })
      ),
      availableTools: tools.reduce(
        (toolSet, definition) => toolSet.addCustom(definition.name),
        new ToolSet()
      ),
      onPermissionRequest: approveAll,
      systemMessage: {mode: "append", content: options.systemPromptAppend}
    } as const;
    const conversationId =
      options.resume?.conversationId ??
      (options.resume ? randomUUID() : options.sessionId);
    const session = options.resume?.conversationId
      ? await client.resumeSession(conversationId, {
          ...sessionConfig,
          continuePendingWork: false
        })
      : await client.createSession({
          ...sessionConfig,
          sessionId: conversationId
        });
    const lifecycleEvents =
      "getEvents" in session && typeof session.getEvents === "function"
        ? await session.getEvents().catch(() => [])
        : [];
    const lifecycle = [...lifecycleEvents]
      .reverse()
      .find(
        event =>
          event.type === "session.start" || event.type === "session.resume"
      );
    await options.handlers.onSessionIdentity?.({
      provider: "copilot",
      conversationId: session.sessionId,
      ...(lifecycle?.data.selectedModel
        ? {model: lifecycle.data.selectedModel}
        : {})
    });

    session.on("assistant.message_delta", event => {
      options.handlers.onAssistantDelta(
        event.data.messageId,
        event.data.deltaContent,
        event.timestamp
      );
    });
    session.on("assistant.message", event => {
      options.handlers.onAssistantMessage(
        event.data.messageId,
        event.data.content,
        event.timestamp
      );
    });
    session.on("session.error", event => {
      options.handlers.onSessionError(event.data.message, event.timestamp);
    });

    let firstTurn = Boolean(options.resume && !options.resume.conversationId);
    const send = (prompt: string): Promise<void> =>
      turns.enqueue(() => {
        const input =
          firstTurn && options.resume
            ? formatResumedPrompt(prompt, options.resume.history)
            : prompt;
        firstTurn = false;
        return session.sendAndWait({prompt: input}).then(() => {});
      });

    return {
      async send(prompt: string): Promise<void> {
        await send(prompt);
      },
      async sendAndWait(prompt: string): Promise<void> {
        await send(prompt);
      },
      interrupt: () => turns.interrupt(() => session.abort()),
      async listModels() {
        const models = await client.listModels();
        return models
          .filter(model => model.policy?.state !== "disabled")
          .map(model => ({
            id: model.id,
            name: model.name,
            ...(model.billing?.multiplier !== undefined
              ? {multiplier: model.billing.multiplier}
              : {})
          }));
      },
      async setModel(modelId: string): Promise<void> {
        await session.setModel(modelId);
      },
      async disconnect(): Promise<void> {
        const cleanupErrors: unknown[] = [];
        await turns
          .interrupt(() => session.abort())
          .catch(error => cleanupErrors.push(error));
        await turns.disconnect().catch(error => cleanupErrors.push(error));
        await session.disconnect().catch(error => cleanupErrors.push(error));
        await client.stop().catch(error => cleanupErrors.push(error));
        if (cleanupErrors.length > 0) {
          throw new AggregateError(cleanupErrors, "Copilot cleanup failed");
        }
      }
    };
  } catch (error) {
    await client.stop().catch(() => {});
    throw error;
  }
}
