import {grepCodebase} from "./grepCodebase.js";
import {listCodebaseDirectory} from "./listCodebaseDirectory.js";
import {readCodebaseFile} from "./readCodebaseFile.js";
import {resolveWithinRoots} from "./resolveWithinRoots.js";
import type {ReadCodebaseRequest, ReadCodebaseResult} from "./types.js";

export function executeReadCodebase(
  roots: Iterable<string>,
  request: ReadCodebaseRequest
): ReadCodebaseResult {
  const resolved = resolveWithinRoots(request.path, roots);
  if (!resolved.ok) return {ok: false, error: resolved.error};
  if (request.command === "list") return listCodebaseDirectory(resolved.path);
  if (request.command === "read") return readCodebaseFile(resolved.path);
  return grepCodebase(resolved.path, request.pattern, request.glob);
}
