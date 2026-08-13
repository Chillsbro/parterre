import type {SessionMetadata} from "../types/index.js";
import {openSessionDatabase} from "./openSessionDatabase.js";

export async function getSession(
  storageDir: string,
  sessionId: string
): Promise<SessionMetadata | undefined> {
  const row = openSessionDatabase(storageDir)
    .query("SELECT * FROM sessions WHERE id = $id")
    .get({$id: sessionId}) as
    | (Omit<
        SessionMetadata,
        "providerSessionId" | "baseUrl" | "redactionVerifiers"
      > & {
        providerSessionId: string | null;
        baseUrl: string | null;
        redactionVerifiers: string | null;
      })
    | undefined;
  if (!row) return undefined;
  return {
    ...row,
    ...(row.providerSessionId
      ? {providerSessionId: row.providerSessionId}
      : {providerSessionId: undefined}),
    ...(row.baseUrl ? {baseUrl: row.baseUrl} : {baseUrl: undefined}),
    ...(row.redactionVerifiers
      ? {redactionVerifiers: JSON.parse(row.redactionVerifiers) as string[]}
      : {redactionVerifiers: undefined})
  };
}
