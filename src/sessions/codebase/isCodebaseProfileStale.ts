import {resolve} from "node:path";
import {openSessionDatabase} from "../storage/openSessionDatabase.js";

export const codebaseProfileMaxAgeMs = 24 * 60 * 60 * 1000;

interface LearnedAtRow {
  learnedAt: string;
}

export async function isCodebaseProfileStale(
  storageDir: string,
  path: string,
  now: Date = new Date()
): Promise<boolean> {
  const resolvedPath = resolve(path);
  const row = openSessionDatabase(storageDir)
    .query("SELECT learnedAt FROM codebase_profiles WHERE path = $path")
    .get({$path: resolvedPath}) as LearnedAtRow | null;
  if (!row) return true;
  const learnedAt = new Date(row.learnedAt).getTime();
  if (Number.isNaN(learnedAt)) return true;
  return now.getTime() - learnedAt > codebaseProfileMaxAgeMs;
}
