import type {SessionStatus} from "../types/index.js";
import {openSessionDatabase} from "./openSessionDatabase.js";

export async function updateSessionStatus(
  storageDir: string,
  sessionId: string,
  status: SessionStatus
): Promise<void> {
  openSessionDatabase(storageDir)
    .query(
      "UPDATE sessions SET status = $status, updatedAt = $updatedAt WHERE id = $id"
    )
    .run({
      $status: status,
      $updatedAt: new Date().toISOString(),
      $id: sessionId
    });
}
