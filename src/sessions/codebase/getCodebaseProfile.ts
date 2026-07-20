import {resolve} from "node:path";
import {openSessionDatabase} from "../storage/openSessionDatabase.js";
import type {
  CodebaseProfile,
  CodebaseProfileEntry,
  CodebaseProfileSourceKind
} from "./types.js";

interface ProfileRow {
  path: string;
  learnedAt: string;
  sourceKind: CodebaseProfileSourceKind;
  summary: string;
}

export async function getCodebaseProfile(
  storageDir: string,
  path: string,
  category?: string
): Promise<CodebaseProfile | undefined> {
  const resolvedPath = resolve(path);
  const normalizedCategory = category?.trim();
  const database = openSessionDatabase(storageDir);
  const profile = database
    .query(
      "SELECT path, learnedAt, sourceKind, summary FROM codebase_profiles WHERE path = $path"
    )
    .get({$path: resolvedPath}) as ProfileRow | null;
  if (!profile) return undefined;
  const entries = (
    normalizedCategory
      ? database
          .query(
            "SELECT category, content FROM codebase_profile_entries WHERE path = $path AND category = $category ORDER BY id"
          )
          .all({$path: resolvedPath, $category: normalizedCategory})
      : database
          .query(
            "SELECT category, content FROM codebase_profile_entries WHERE path = $path ORDER BY id"
          )
          .all({$path: resolvedPath})
  ) as CodebaseProfileEntry[];
  return {
    path: profile.path,
    learnedAt: profile.learnedAt,
    sourceKind: profile.sourceKind,
    summary: profile.summary,
    entries
  };
}
