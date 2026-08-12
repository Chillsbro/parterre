import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import type {
  createSessionRuntime,
  RuntimeNotification
} from "../../src/runtime/index.js";
import type {SessionEvent} from "../../src/sessions/index.js";

export interface ScriptedRuntime {
  createRuntime: typeof createSessionRuntime;
  emit(event: SessionEvent): void;
  sentMessages: Array<{content: string; displayContent: string}>;
  approvals: Array<{requestId: string; approved: boolean}>;
  modelChanges: string[];
  interruptionCount(): number;
  stopped(): boolean;
}

export function createScriptedRuntime(options?: {
  respond?: (content: string) => SessionEvent[];
}): ScriptedRuntime {
  const sentMessages: Array<{content: string; displayContent: string}> = [];
  const approvals: Array<{requestId: string; approved: boolean}> = [];
  const modelChanges: string[] = [];
  let notify: ((notification: RuntimeNotification) => void) | undefined;
  let stopped = false;
  let interruptions = 0;
  let activeTurnId: string | undefined;

  const emit = (event: SessionEvent): void => {
    if (event.type === "agent_turn_started") activeTurnId = event.turnId;
    if (
      (event.type === "agent_turn_finished" ||
        event.type === "agent_interrupted") &&
      event.turnId === activeTurnId
    ) {
      activeTurnId = undefined;
    }
    notify?.({type: "event", event});
  };

  const createRuntime: typeof createSessionRuntime = async runtimeOptions => {
    notify = runtimeOptions.onNotification;
    notify({type: "status", status: "running"});
    return {
      async sendUserMessage(content, _waitForResponse, displayContent) {
        const turnId = randomUUID();
        sentMessages.push({content, displayContent: displayContent ?? content});
        emit({
          type: "user_message",
          timestamp: new Date().toISOString(),
          id: randomUUID(),
          content: displayContent ?? content
        });
        emit({
          type: "agent_turn_started",
          timestamp: new Date().toISOString(),
          turnId
        });
        for (const event of options?.respond?.(content) ?? []) emit(event);
        emit({
          type: "agent_turn_finished",
          timestamp: new Date().toISOString(),
          turnId
        });
      },
      async resolveApproval(requestId, approved) {
        approvals.push({requestId, approved});
        emit({
          type: "approval_resolved",
          timestamp: new Date().toISOString(),
          requestId,
          approved
        });
      },
      async listModels() {
        return [{id: "scripted-model", name: "Scripted Model"}];
      },
      async setModel(modelId) {
        modelChanges.push(modelId);
        emit({
          type: "model_changed",
          timestamp: new Date().toISOString(),
          model: modelId
        });
      },
      authorizeCodebaseRoot(path) {
        return resolve(path);
      },
      async clearCodebaseProfile() {},
      async isWorkspaceProfileStale() {
        return false;
      },
      async interrupt() {
        if (!activeTurnId) return false;
        interruptions += 1;
        emit({
          type: "agent_interrupted",
          timestamp: new Date().toISOString(),
          turnId: activeTurnId
        });
        activeTurnId = undefined;
        return true;
      },
      async stop() {
        stopped = true;
        notify?.({type: "status", status: "stopped"});
      }
    };
  };

  return {
    createRuntime,
    emit,
    sentMessages,
    approvals,
    modelChanges,
    interruptionCount: () => interruptions,
    stopped: () => stopped
  };
}

export function assistantReply(content: string): SessionEvent {
  return {
    type: "agent_message",
    timestamp: new Date().toISOString(),
    message: {type: "assistant_message", id: randomUUID(), content}
  };
}
