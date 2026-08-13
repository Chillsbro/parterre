import {
  closePlaywrightSession,
  createPlaywrightExecutor
} from "../../playwright/index.js";
import {
  updateSessionAgentIdentity,
  updateSessionStatus
} from "../../sessions/index.js";
import {createBrowserCommandRunner} from "../browser/index.js";
import {ensureScreencast} from "../capturing/index.js";
import {
  type AgentFactory,
  type AgentHandle,
  resolveAgentFactory
} from "../providers/index.js";
import type {SessionResumePlan} from "../resuming/index.js";
import {
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
  agentFactory?: AgentFactory,
  resume?: SessionResumePlan | undefined
): Promise<AgentHandle> {
  let agent: AgentHandle | undefined;
  try {
    const createAgent =
      agentFactory ?? (await resolveAgentFactory(context.config.provider));
    const runner = createBrowserCommandRunner({
      context,
      executor: createPlaywrightExecutor({
        command: context.config.playwrightCommand,
        workspace: context.config.workspace,
        playwrightSession: context.playwrightSession,
        storageDir: context.config.storageDir,
        sessionId: context.sessionId
      })
    });
    agent = await createAgent({
      sessionId: context.sessionId,
      model: context.config.model,
      workspace: context.config.workspace,
      systemPromptAppend,
      baseUrl: context.config.baseUrl,
      ...(resume
        ? {
            resume: {
              conversationId: resume.metadata.providerSessionId,
              history: resume.history
            }
          }
        : {}),
      tools: [
        createPlaywrightTool(runner),
        createMaterializeTargetTestTool(context),
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
        },
        onSessionIdentity: identity =>
          updateSessionAgentIdentity(
            context.config.storageDir,
            context.sessionId,
            identity
          )
      }
    });
    if (resume && context.state.browserOpened) {
      await ensureScreencast(context);
    } else if (resume?.lastUrl) {
      const restored = await runner.run({
        id: `resume-${context.sessionId}`,
        command: "open",
        args: [resume.lastUrl],
        reason: "Restore the last resumable page URL"
      });
      if (!restored.ok) {
        throw new Error(
          `Could not restore ${resume.lastUrl}: ${restored.error ?? restored.output ?? "unknown browser error"}`
        );
      }
    }
    return agent;
  } catch (error) {
    const cleanupResults = await Promise.allSettled([
      ...(agent ? [agent.disconnect()] : []),
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
