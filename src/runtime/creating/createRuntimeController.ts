import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {
  clearCodebaseProfile,
  getCodebaseProfile,
  isCodebaseProfileStale
} from "../../sessions/index.js";
import {validateCodebaseRoot} from "../codebase/index.js";
import type {AgentHandle} from "../providers/index.js";
import type {
  ModelChoice,
  RuntimeContext,
  RuntimeController
} from "../types/index.js";
import {stopSessionRuntime} from "./stopSessionRuntime.js";

export function createRuntimeController(
  context: RuntimeContext,
  agent: AgentHandle
): RuntimeController {
  interface RuntimeTurn {
    id: string;
    agentStarted: boolean;
    interruptionRequested: boolean;
    settled: Promise<void>;
    settle(): void;
  }
  const activeTurns: RuntimeTurn[] = [];
  const sendUserMessage = async (
    content: string,
    waitForResponse = false,
    displayContent = content
  ): Promise<void> => {
    const id = randomUUID();
    let settle = (): void => {};
    const turn: RuntimeTurn = {
      id,
      agentStarted: false,
      interruptionRequested: false,
      settled: new Promise<void>(resolveSettled => {
        settle = resolveSettled;
      }),
      settle: () => settle()
    };
    activeTurns.push(turn);
    const executeTurn = async (): Promise<void> => {
      try {
        await context.publish({
          type: "user_message",
          timestamp: new Date().toISOString(),
          id,
          content: displayContent
        });
        await context.publish({
          type: "agent_turn_started",
          timestamp: new Date().toISOString(),
          turnId: id
        });
        if (!turn.interruptionRequested) {
          turn.agentStarted = true;
          if (waitForResponse) await agent.sendAndWait(content);
          else await agent.send(content);
        }
      } finally {
        try {
          await context.publish({
            type: turn.interruptionRequested
              ? "agent_interrupted"
              : "agent_turn_finished",
            timestamp: new Date().toISOString(),
            turnId: id
          });
        } finally {
          const index = activeTurns.indexOf(turn);
          if (index >= 0) activeTurns.splice(index, 1);
          turn.settle();
        }
      }
    };
    const execution = executeTurn();
    if (waitForResponse) {
      await execution;
    } else {
      void execution.catch(error =>
        context.publish({
          type: "process_error",
          timestamp: new Date().toISOString(),
          source: "agent",
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }
  };

  return {
    sendUserMessage,
    async interrupt(): Promise<boolean> {
      const turn = activeTurns[0];
      if (!turn || turn.interruptionRequested) return false;
      turn.interruptionRequested = true;
      if (turn.agentStarted) {
        let interrupted: boolean;
        try {
          interrupted = await agent.interrupt();
        } catch (error) {
          turn.interruptionRequested = false;
          throw error;
        }
        if (!interrupted) turn.interruptionRequested = false;
      }
      await turn.settled;
      return turn.interruptionRequested;
    },
    async resolveApproval(requestId: string, approved: boolean): Promise<void> {
      await context.approvals.resolve(requestId, approved);
    },
    async listModels(): Promise<ModelChoice[]> {
      return agent.listModels();
    },
    async setModel(modelId: string): Promise<void> {
      await agent.setModel(modelId);
      await context.publish({
        type: "model_changed",
        timestamp: new Date().toISOString(),
        model: modelId
      });
    },
    authorizeCodebaseRoot(path: string): string {
      const resolved = resolve(context.config.workspace, path);
      if (!context.authorizedCodebaseRoots.has(resolved)) {
        validateCodebaseRoot(resolved);
      }
      context.authorizedCodebaseRoots.delete(resolved);
      context.authorizedCodebaseRoots.add(resolved);
      return resolved;
    },
    async clearCodebaseProfile(path: string): Promise<void> {
      await clearCodebaseProfile(context.config.storageDir, path);
    },
    async isWorkspaceProfileStale(): Promise<boolean> {
      const workspace = resolve(context.config.workspace);
      const existing = await getCodebaseProfile(
        context.config.storageDir,
        workspace
      );
      if (!existing) return false;
      return isCodebaseProfileStale(context.config.storageDir, workspace);
    },
    async stop(): Promise<void> {
      return context.beginStop(() => stopSessionRuntime(context, agent));
    }
  };
}
