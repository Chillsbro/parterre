import type {CopilotClient as CopilotClientType} from "@github/copilot-sdk";
import {z} from "zod";
import type {AgentFactoryOptions, AgentHandle} from "./AgentProvider.js";
import {loadAdapterModule} from "./adapterModules.js";
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
  options: AgentFactoryOptions
): Promise<AgentHandle> {
  const {approveAll, CopilotClient, defineTool, ToolSet} =
    await loadAdapterModule<typeof import("@github/copilot-sdk")>(
      "@github/copilot-sdk"
    );
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
    const session = await client.createSession({
      sessionId: options.sessionId,
      model: options.model,
      streaming: true,
      tools: options.tools.map(definition =>
        defineTool(definition.name, {
          description: definition.description,
          parameters: z.object(definition.schema),
          defer: "never",
          skipPermission: true,
          handler: definition.handler
        })
      ),
      availableTools: options.tools.reduce(
        (toolSet, definition) => toolSet.addCustom(definition.name),
        new ToolSet()
      ),
      onPermissionRequest: approveAll,
      systemMessage: {mode: "append", content: options.systemPromptAppend}
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

    return {
      async send(prompt: string): Promise<void> {
        await session.send({prompt});
      },
      async sendAndWait(prompt: string): Promise<void> {
        await session.sendAndWait({prompt});
      },
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
