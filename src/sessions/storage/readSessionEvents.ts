import type {SessionEvent} from "../types/index.js";
import {openSessionDatabase} from "./openSessionDatabase.js";

export async function readSessionEvents(
  storageDir: string,
  sessionId: string
): Promise<SessionEvent[]> {
  const rows = openSessionDatabase(storageDir)
    .query(
      "SELECT payload FROM events WHERE sessionId = $sessionId ORDER BY id"
    )
    .all({$sessionId: sessionId}) as Array<{payload: string}>;
  return rows.map(row => JSON.parse(row.payload) as SessionEvent);
}
