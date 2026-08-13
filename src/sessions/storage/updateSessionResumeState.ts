import {openSessionDatabase} from "./openSessionDatabase.js";
import {createRedactionVerifiers} from "./redactionVerifiers.js";

export async function updateSessionAgentIdentity(
  storageDir: string,
  sessionId: string,
  identity: {
    provider: string;
    conversationId?: string | undefined;
    model?: string | undefined;
  }
): Promise<void> {
  openSessionDatabase(storageDir)
    .query(
      `UPDATE sessions
       SET agent = $agent, providerSessionId = $providerSessionId,
           model = COALESCE($model, model),
           schemaVersion = 3, updatedAt = $updatedAt
       WHERE id = $id`
    )
    .run({
      $agent: identity.provider,
      $providerSessionId: identity.conversationId ?? null,
      $model: "model" in identity ? (identity.model ?? null) : null,
      $updatedAt: new Date().toISOString(),
      $id: sessionId
    });
}

export async function markSessionResuming(
  storageDir: string,
  sessionId: string,
  playwrightSession: string
): Promise<void> {
  openSessionDatabase(storageDir)
    .query(
      `UPDATE sessions
       SET status = 'starting', playwrightSession = $playwrightSession,
           updatedAt = $updatedAt
       WHERE id = $id`
    )
    .run({
      $playwrightSession: playwrightSession,
      $updatedAt: new Date().toISOString(),
      $id: sessionId
    });
}

export async function markSessionResumed(
  storageDir: string,
  sessionId: string,
  redactions: string[]
): Promise<void> {
  openSessionDatabase(storageDir)
    .query(
      `UPDATE sessions
       SET resumeCount = resumeCount + 1,
           redactionCount = $redactionCount,
           redactionVerifiers = $redactionVerifiers,
           updatedAt = $updatedAt
       WHERE id = $id`
    )
    .run({
      $redactionCount: redactions.length,
      $redactionVerifiers: JSON.stringify(createRedactionVerifiers(redactions)),
      $updatedAt: new Date().toISOString(),
      $id: sessionId
    });
}

export async function updateSessionModel(
  storageDir: string,
  sessionId: string,
  model: string
): Promise<void> {
  openSessionDatabase(storageDir)
    .query(
      "UPDATE sessions SET model = $model, updatedAt = $updatedAt WHERE id = $id"
    )
    .run({
      $model: model,
      $updatedAt: new Date().toISOString(),
      $id: sessionId
    });
}
