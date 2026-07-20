import {resolve} from "node:path";
import {openSessionDatabase} from "../storage/openSessionDatabase.js";
import type {CodebaseProfileEntry, CodebaseProfileSourceKind} from "./types.js";

export async function saveCodebaseProfile(
  storageDir: string,
  input: {
    path: string;
    sourceKind: CodebaseProfileSourceKind;
    summary: string;
    entries: CodebaseProfileEntry[];
  }
): Promise<number> {
  const path = resolve(input.path);
  const database = openSessionDatabase(storageDir);
  const learnedAt = new Date().toISOString();
  const save = database.transaction(() => {
    database
      .query(
        "INSERT INTO codebase_profiles (path, learnedAt, sourceKind, summary) VALUES ($path, $learnedAt, $sourceKind, $summary) ON CONFLICT(path) DO UPDATE SET learnedAt = $learnedAt, sourceKind = $sourceKind, summary = $summary"
      )
      .run({
        $path: path,
        $learnedAt: learnedAt,
        $sourceKind: input.sourceKind,
        $summary: input.summary.trim()
      });
    database
      .query("DELETE FROM codebase_profile_entries WHERE path = $path")
      .run({$path: path});
    const insertEntry = database.query(
      "INSERT INTO codebase_profile_entries (path, category, content) VALUES ($path, $category, $content)"
    );
    let saved = 0;
    for (const entry of input.entries) {
      const content = entry.content.trim();
      if (!content) continue;
      insertEntry.run({
        $path: path,
        $category: entry.category.trim() || "general",
        $content: content
      });
      saved += 1;
    }
    return saved;
  });
  return save();
}
