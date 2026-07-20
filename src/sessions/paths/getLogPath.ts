import {basename, join} from "node:path";
import {getSessionPath} from "./getSessionPath.js";

export function getLogPath(
  storageDir: string,
  sessionId: string,
  filename: string
): string {
  return join(
    getSessionPath(storageDir, sessionId),
    "logs",
    basename(filename)
  );
}
