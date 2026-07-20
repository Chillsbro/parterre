import {realpathSync} from "node:fs";
import {isAbsolute, resolve, sep} from "node:path";

function isInsideRoot(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

function toRealPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function resolveWithinRoots(
  requested: string | undefined,
  roots: Iterable<string>
): {ok: true; path: string} | {ok: false; error: string} {
  const rootList = [...roots].map(root => resolve(root));
  const activeRoot = rootList[rootList.length - 1];
  if (!activeRoot) {
    return {ok: false, error: "No codebase has been authorized this session"};
  }
  const base = requested?.trim() ? requested.trim() : ".";
  const resolved = isAbsolute(base) ? resolve(base) : resolve(activeRoot, base);
  const withinLexical = rootList.some(root => isInsideRoot(resolved, root));
  if (!withinLexical) {
    return {
      ok: false,
      error: `Path is outside the authorized codebase roots: ${resolved}`
    };
  }
  const real = toRealPath(resolved);
  const withinReal = rootList.some(root =>
    isInsideRoot(real, toRealPath(root))
  );
  if (!withinReal) {
    return {
      ok: false,
      error: `Path escapes the authorized codebase roots: ${resolved}`
    };
  }
  return {ok: true, path: resolved};
}
