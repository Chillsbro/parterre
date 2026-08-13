import {createTwoFilesPatch, parsePatch} from "diff";
import type {WorkspaceReview} from "../../runtime/index.js";

export type WorkspacePatchResult =
  | {ok: true; patch: string; additions: number; deletions: number}
  | {ok: false; error: string};

export function createWorkspacePatch(
  review: WorkspaceReview,
  limits: {timeoutMs?: number; maxEditLength?: number} = {}
): WorkspacePatchResult {
  const patch = createTwoFilesPatch(
    review.action === "create" ? "/dev/null" : `a/${review.relativePath}`,
    `b/${review.relativePath}`,
    review.before,
    review.after,
    review.action === "create" ? "new file" : "before",
    "proposed",
    {
      context: 3,
      timeout: limits.timeoutMs ?? 1500,
      maxEditLength: limits.maxEditLength ?? 200_000
    }
  );
  if (patch === undefined) {
    return {
      ok: false,
      error:
        "The exact diff exceeded the review budget. Deny this write and ask the agent to propose a smaller change."
    };
  }
  const lines = parsePatch(patch)[0]?.hunks.flatMap(hunk => hunk.lines) ?? [];
  return {
    ok: true,
    patch,
    additions: lines.filter(line => line.startsWith("+")).length,
    deletions: lines.filter(line => line.startsWith("-")).length
  };
}
