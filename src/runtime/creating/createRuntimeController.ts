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
  const sendUserMessage = async (
    content: string,
    waitForResponse = false,
    displayContent = content
  ): Promise<void> => {
    const id = randomUUID();
    await context.publish({
      type: "user_message",
      timestamp: new Date().toISOString(),
      id,
      content: displayContent
    });
    if (waitForResponse) await agent.sendAndWait(content);
    else await agent.send(content);
  };

  return {
    sendUserMessage,
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
