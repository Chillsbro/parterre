import {readdirSync, readFileSync, statSync} from "node:fs";
import {relative, resolve, sep} from "node:path";
import {
  grepMaxFileBytes,
  grepMaxMatches,
  ignoredDirectories
} from "./limits.js";
import type {ReadCodebaseResult} from "./types.js";

function matchesGlob(name: string, glob: string | undefined): boolean {
  if (!glob) return true;
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(name);
}

function walkFiles(root: string, onFile: (file: string) => boolean): void {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(current, {withFileTypes: true});
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = `${current}${sep}${entry.name}`;
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        if (onFile(full)) return;
      }
    }
  }
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function grepCodebase(
  target: string,
  pattern: string | undefined,
  glob: string | undefined
): ReadCodebaseResult {
  const trimmedPattern = pattern?.trim();
  if (!trimmedPattern) {
    return {ok: false, error: "grep requires a pattern"};
  }
  let regex: RegExp;
  try {
    regex = new RegExp(trimmedPattern);
  } catch (error) {
    return {
      ok: false,
      error: `Invalid pattern: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
  const searchRoot = isDirectory(target) ? target : resolve(target, "..");
  const matches: string[] = [];
  walkFiles(searchRoot, file => {
    if (!matchesGlob(file.split(sep).pop() ?? file, glob)) return false;
    let content: string;
    try {
      const stats = statSync(file);
      if (stats.size > grepMaxFileBytes) return false;
      content = readFileSync(file, "utf8");
    } catch {
      return false;
    }
    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line !== undefined && regex.test(line)) {
        matches.push(
          `${relative(searchRoot, file)}:${index + 1}: ${line.trim()}`
        );
        if (matches.length >= grepMaxMatches) return true;
      }
    }
    return false;
  });
  return {
    ok: true,
    output:
      matches.length > 0
        ? matches.join("\n") +
          (matches.length >= grepMaxMatches ? "\n[truncated results]" : "")
        : "(no matches)"
  };
}
