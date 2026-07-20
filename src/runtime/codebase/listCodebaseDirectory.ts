import {readdirSync, statSync} from "node:fs";
import {ignoredDirectories} from "./limits.js";
import type {ReadCodebaseResult} from "./types.js";

export function listCodebaseDirectory(target: string): ReadCodebaseResult {
  try {
    const stats = statSync(target);
    if (!stats.isDirectory()) {
      return {ok: false, error: `Not a directory: ${target}`};
    }
    const entries = readdirSync(target, {withFileTypes: true})
      .filter(entry => !ignoredDirectories.has(entry.name))
      .map(entry => `${entry.isDirectory() ? "dir " : "file"}  ${entry.name}`)
      .sort();
    return {ok: true, output: entries.join("\n") || "(empty directory)"};
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
