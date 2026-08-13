import {randomUUID} from "node:crypto";
import {openSessionDatabase} from "./openSessionDatabase.js";

export interface SessionLease {
  release(): Promise<void>;
}

function processExists(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function acquireSessionLease(
  storageDir: string,
  sessionId: string,
  options: {allowMissingSession?: boolean} = {}
): Promise<SessionLease> {
  const database = openSessionDatabase(storageDir);
  const ownerId = randomUUID();
  const claim = database.transaction(() => {
    const sessionExists = database
      .query("SELECT 1 AS present FROM sessions WHERE id = $sessionId")
      .get({$sessionId: sessionId});
    if (!sessionExists && !options.allowMissingSession) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const existing = database
      .query(
        "SELECT ownerId, processId FROM session_leases WHERE sessionId = $sessionId"
      )
      .get({$sessionId: sessionId}) as
      | {ownerId: string; processId: number}
      | undefined;
    if (existing && processExists(existing.processId)) {
      throw new Error(`Session ${sessionId} is already active`);
    }
    if (existing) {
      database
        .query("DELETE FROM session_leases WHERE sessionId = $sessionId")
        .run({$sessionId: sessionId});
    }
    database
      .query(
        `INSERT INTO session_leases (sessionId, ownerId, processId, acquiredAt)
         VALUES ($sessionId, $ownerId, $processId, $acquiredAt)`
      )
      .run({
        $sessionId: sessionId,
        $ownerId: ownerId,
        $processId: process.pid,
        $acquiredAt: new Date().toISOString()
      });
  });
  claim();
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      openSessionDatabase(storageDir)
        .query(
          "DELETE FROM session_leases WHERE sessionId = $sessionId AND ownerId = $ownerId"
        )
        .run({$sessionId: sessionId, $ownerId: ownerId});
    }
  };
}

export function assertSessionLeaseInactive(
  storageDir: string,
  sessionId: string
): void {
  const database = openSessionDatabase(storageDir);
  const existing = database
    .query("SELECT processId FROM session_leases WHERE sessionId = $sessionId")
    .get({$sessionId: sessionId}) as {processId: number} | undefined;
  if (!existing) return;
  if (processExists(existing.processId)) {
    throw new Error(`Session ${sessionId} is already active`);
  }
  database
    .query("DELETE FROM session_leases WHERE sessionId = $sessionId")
    .run({$sessionId: sessionId});
}
