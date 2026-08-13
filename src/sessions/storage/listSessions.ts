import type {SessionMetadata} from "../types/index.js";
import {getSession} from "./getSession.js";
import {openSessionDatabase} from "./openSessionDatabase.js";

export async function listSessions(
  storageDir: string
): Promise<SessionMetadata[]> {
  const rows = openSessionDatabase(storageDir)
    .query("SELECT * FROM sessions ORDER BY createdAt DESC")
    .all() as Array<{id: string}>;
  return (
    await Promise.all(rows.map(row => getSession(storageDir, row.id)))
  ).filter((session): session is SessionMetadata => Boolean(session));
}
