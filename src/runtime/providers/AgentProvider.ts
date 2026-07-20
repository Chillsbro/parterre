import type {z} from "zod";
import type {ProviderName} from "../../config/index.js";
import type {ModelChoice} from "../types/index.js";

export interface AgentToolDefinition {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler(input: unknown): Promise<unknown>;
}

export interface AgentEventHandlers {
  onAssistantDelta(id: string, delta: string, timestamp: string): void;
  onAssistantMessage(id: string, content: string, timestamp: string): void;
  onSessionError(message: string, timestamp: string): void;
}

export interface AgentHandle {
  send(prompt: string): Promise<void>;
  sendAndWait(prompt: string): Promise<void>;
  listModels(): Promise<ModelChoice[]>;
  setModel(modelId: string): Promise<void>;
  disconnect(): Promise<void>;
}

export interface AgentFactoryOptions {
  sessionId: string;
  model: string;
  workspace: string;
  systemPromptAppend: string;
  baseUrl?: string | undefined;
  tools: AgentToolDefinition[];
  handlers: AgentEventHandlers;
}

export type AgentFactory = (
  options: AgentFactoryOptions
) => Promise<AgentHandle>;

export async function resolveAgentFactory(
  provider: ProviderName
): Promise<AgentFactory> {
  if (provider === "auto") {
    return (await import("./createAutoAgent.js")).createAutoAgent;
  }
  if (provider === "codex") {
    try {
      return (await import("./createCodexAgent.js")).createCodexAgent;
    } catch {
      throw new Error(
        "The Codex adapter is not installed. Run `parterre setup` and choose Codex."
      );
    }
  }
  if (provider === "claude") {
    try {
      return (await import("./createClaudeAgent.js")).createClaudeAgent;
    } catch {
      throw new Error(
        "The Claude adapter is not installed. Run `parterre setup` and choose Claude Code."
      );
    }
  }
  if (provider === "openai") {
    return (await import("./createOpenAiAgent.js")).createOpenAiAgent;
  }
  try {
    return (await import("./createCopilotAgent.js")).createCopilotAgent;
  } catch {
    throw new Error(
      "The Copilot adapter is not installed. Run `parterre setup` and choose GitHub Copilot."
    );
  }
}
