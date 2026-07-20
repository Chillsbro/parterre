import type {SessionMetadata} from "../types/index.js";
import {openSessionDatabase} from "./openSessionDatabase.js";

export async function listSessions(
  storageDir: string
): Promise<SessionMetadata[]> {
  return openSessionDatabase(storageDir)
    .query("SELECT * FROM sessions ORDER BY createdAt DESC")
    .all() as SessionMetadata[];
}
