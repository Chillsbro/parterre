import {resolve, sep} from "node:path";

export function getSessionPath(storageDir: string, sessionId: string): string {
  const rootPath = resolve(storageDir);
  const sessionPath = resolve(rootPath, sessionId);
  if (
    sessionPath !== rootPath &&
    !sessionPath.startsWith(`${rootPath}${sep}`)
  ) {
    throw new Error("Invalid session ID");
  }
  return sessionPath;
}
