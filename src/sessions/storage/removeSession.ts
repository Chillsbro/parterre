import {rm} from "node:fs/promises";
import {getSessionPath} from "../paths/index.js";
import {assertSessionLeaseInactive} from "./acquireSessionLease.js";
import {openSessionDatabase} from "./openSessionDatabase.js";

export async function removeSession(
  storageDir: string,
  sessionId: string
): Promise<void> {
  assertSessionLeaseInactive(storageDir, sessionId);
  const database = openSessionDatabase(storageDir);
  database
    .query("DELETE FROM events WHERE sessionId = $id")
    .run({$id: sessionId});
  database.query("DELETE FROM sessions WHERE id = $id").run({$id: sessionId});
  await rm(getSessionPath(storageDir, sessionId), {
    recursive: true,
    force: true
  });
}
