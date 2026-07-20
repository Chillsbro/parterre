import {basename, join} from "node:path";
import {getSessionPath} from "./getSessionPath.js";

export function getArtifactPath(
  storageDir: string,
  sessionId: string,
  kind: string,
  filename: string
): string {
  const safeKind = ["screenshots", "snapshots", "traces", "videos"].includes(
    kind
  )
    ? kind
    : "snapshots";
  return join(
    getSessionPath(storageDir, sessionId),
    "artifacts",
    safeKind,
    basename(filename)
  );
}
