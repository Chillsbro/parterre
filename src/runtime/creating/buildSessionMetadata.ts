import type {SessionMetadata} from "../../sessions/index.js";
import type {RuntimeContext} from "../types/index.js";

export function buildSessionMetadata(context: RuntimeContext): SessionMetadata {
  return {
    schemaVersion: 2,
    id: context.sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workspace: context.config.workspace,
    agent: context.config.provider,
    model: context.config.model,
    playwrightSession: context.playwrightSession,
    status: "starting"
  };
}
