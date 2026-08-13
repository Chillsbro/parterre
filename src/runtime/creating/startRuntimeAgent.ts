import {
  closePlaywrightSession,
  createPlaywrightExecutor
} from "../../playwright/index.js";
import {updateSessionStatus} from "../../sessions/index.js";
import {
  createBrowserAssertionRunner,
  createBrowserCommandRunner
} from "../browser/index.js";
import {
  type AgentFactory,
  type AgentHandle,
  resolveAgentFactory
} from "../providers/index.js";
import {
  createBrowserAssertionTool,
  createMaterializeTargetTestTool,
  createPlaywrightTool,
  createQueryCodebaseProfileTool,
  createReadCodebaseTool,
  createSaveCodebaseProfileTool,
  createWriteWorkspaceFileTool
} from "../tools/index.js";
import type {RuntimeContext} from "../types/index.js";
import {systemPromptAppend} from "./systemPromptAppend.js";

export async function startRuntimeAgent(
  context: RuntimeContext,
  agentFactory?: AgentFactory
): Promise<AgentHandle> {
  try {
    const createAgent =
      agentFactory ?? (await resolveAgentFactory(context.config.provider));
    const executor = createPlaywrightExecutor({
      command: context.config.playwrightCommand,
      workspace: context.config.workspace,
      playwrightSession: context.playwrightSession,
      storageDir: context.config.storageDir,
      sessionId: context.sessionId
    });
    const runner = createBrowserCommandRunner({
      context,
      executor
    });
    const passedAssertionIds = new Set<string>();
    const assertionRunner = createBrowserAssertionRunner({
      context,
      browser: runner,
      executor,
      passedAssertionIds
    });
    return await createAgent({
      sessionId: context.sessionId,
      model: context.config.model,
      workspace: context.config.workspace,
      systemPromptAppend,
      baseUrl: context.config.baseUrl,
      tools: [
        createPlaywrightTool(runner),
        createBrowserAssertionTool(assertionRunner),
        createMaterializeTargetTestTool(context, passedAssertionIds),
        createReadCodebaseTool(context),
        createWriteWorkspaceFileTool(context),
        createSaveCodebaseProfileTool(context),
        createQueryCodebaseProfileTool(context)
      ],
      handlers: {
        onAssistantDelta: (id, delta, timestamp) => {
          void context.publish({
            type: "agent_message",
            timestamp,
            message: {type: "assistant_delta", id, delta}
          });
        },
        onAssistantMessage: (id, content, timestamp) => {
          void context.publish({
            type: "agent_message",
            timestamp,
            message: {type: "assistant_message", id, content}
          });
        },
        onSessionError: (message, timestamp) => {
          void context.publish({
            type: "process_error",
            timestamp,
            source: "agent",
            message
          });
          context.onNotification({type: "status", status: "failed"});
          void updateSessionStatus(
            context.config.storageDir,
            context.sessionId,
            "failed"
          );
        }
      }
    });
  } catch (error) {
    const cleanupResults = await Promise.allSettled([
      closePlaywrightSession({
        command: context.config.playwrightCommand,
        workspace: context.config.workspace,
        playwrightSession: context.playwrightSession
      })
    ]);
    await updateSessionStatus(
      context.config.storageDir,
      context.sessionId,
      "failed"
    );
    context.onNotification({type: "status", status: "failed"});
    const cleanupErrors = cleanupResults.flatMap(result =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "Runtime startup and cleanup failed"
      );
    }
    throw error;
  }
}
