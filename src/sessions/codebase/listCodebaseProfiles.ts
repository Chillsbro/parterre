import {openSessionDatabase} from "../storage/openSessionDatabase.js";
import type {CodebaseProfileSummary} from "./types.js";

export async function listCodebaseProfiles(
  storageDir: string
): Promise<CodebaseProfileSummary[]> {
  return openSessionDatabase(storageDir)
    .query(
      "SELECT path, learnedAt, sourceKind FROM codebase_profiles ORDER BY path"
    )
    .all() as CodebaseProfileSummary[];
}
