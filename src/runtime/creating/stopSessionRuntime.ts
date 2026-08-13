import {closePlaywrightSession} from "../../playwright/index.js";
import {
  closeSessionDatabase,
  updateSessionStatus
} from "../../sessions/index.js";
import type {AgentHandle} from "../providers/index.js";
import type {RuntimeContext} from "../types/index.js";

export async function stopSessionRuntime(
  context: RuntimeContext,
  agent: AgentHandle,
  requestedStatus: "stopped" | "failed" = "stopped"
): Promise<void> {
  const cleanupErrors: unknown[] = [];
  context.approvals.abandonAll();
  await context.flush();
  context.state.screencast?.stop();
  context.state.screencast = undefined;
  await agent.disconnect().catch(error => cleanupErrors.push(error));
  await closePlaywrightSession({
    command: context.config.playwrightCommand,
    workspace: context.config.workspace,
    playwrightSession: context.playwrightSession
  }).catch(error => cleanupErrors.push(error));

  const status = cleanupErrors.length === 0 ? requestedStatus : "failed";
  await context
    .publish({
      type: "session_stopped",
      timestamp: new Date().toISOString(),
      message:
        cleanupErrors.length === 0
          ? requestedStatus === "failed"
            ? "Session startup failed and resources were released"
            : "Session stopped"
          : "Session stopped with cleanup errors"
    })
    .catch(error => cleanupErrors.push(error));
  await updateSessionStatus(
    context.config.storageDir,
    context.sessionId,
    status
  ).catch(error => cleanupErrors.push(error));
  await context
    .releaseSessionLease?.()
    .catch(error => cleanupErrors.push(error));
  try {
    closeSessionDatabase(context.config.storageDir);
  } catch (error) {
    cleanupErrors.push(error);
  }
  context.onNotification({type: "status", status});
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Runtime cleanup failed");
  }
}
