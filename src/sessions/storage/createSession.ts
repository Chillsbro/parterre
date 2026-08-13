import {mkdir} from "node:fs/promises";
import {join} from "node:path";
import {getSessionPath} from "../paths/index.js";
import type {SessionMetadata} from "../types/index.js";
import {openSessionDatabase} from "./openSessionDatabase.js";

export async function createSession(
  storageDir: string,
  metadata: SessionMetadata
): Promise<void> {
  const sessionPath = getSessionPath(storageDir, metadata.id);
  await Promise.all([
    mkdir(join(sessionPath, "logs"), {recursive: true}),
    mkdir(join(sessionPath, "artifacts", "screenshots"), {recursive: true}),
    mkdir(join(sessionPath, "artifacts", "snapshots"), {recursive: true}),
    mkdir(join(sessionPath, "artifacts", "traces"), {recursive: true}),
    mkdir(join(sessionPath, "artifacts", "videos"), {recursive: true})
  ]);
  openSessionDatabase(storageDir)
    .query(
      `INSERT OR REPLACE INTO sessions
        (id, schemaVersion, createdAt, updatedAt, workspace, agent, model, playwrightSession, status, providerSessionId, baseUrl, resumeCount, redactionCount, redactionVerifiers)
       VALUES ($id, $schemaVersion, $createdAt, $updatedAt, $workspace, $agent, $model, $playwrightSession, $status, $providerSessionId, $baseUrl, $resumeCount, $redactionCount, $redactionVerifiers)`
    )
    .run({
      $id: metadata.id,
      $schemaVersion: metadata.schemaVersion,
      $createdAt: metadata.createdAt,
      $updatedAt: metadata.updatedAt,
      $workspace: metadata.workspace,
      $agent: metadata.agent,
      $model: metadata.model,
      $playwrightSession: metadata.playwrightSession,
      $status: metadata.status,
      $providerSessionId: metadata.providerSessionId ?? null,
      $baseUrl: metadata.baseUrl ?? null,
      $resumeCount: metadata.resumeCount ?? 0,
      $redactionCount: metadata.redactionCount ?? 0,
      $redactionVerifiers: metadata.redactionVerifiers
        ? JSON.stringify(metadata.redactionVerifiers)
        : null
    });
}
