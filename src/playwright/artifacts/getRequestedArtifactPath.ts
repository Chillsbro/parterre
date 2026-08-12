import {getArtifactPath} from "../../sessions/index.js";
import type {PlaywrightRequest} from "../types/index.js";

export function getRequestedArtifactPath(
  storageDir: string,
  sessionId: string,
  request: PlaywrightRequest
): string | undefined {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  if (request.command === "screenshot") {
    return getArtifactPath(
      storageDir,
      sessionId,
      "screenshots",
      `${timestamp}-${request.id}.png`
    );
  }
  if (request.command === "snapshot") {
    return getArtifactPath(
      storageDir,
      sessionId,
      "snapshots",
      `${timestamp}-${request.id}.yaml`
    );
  }
  if (request.command === "pdf") {
    return getArtifactPath(
      storageDir,
      sessionId,
      "snapshots",
      `${timestamp}-${request.id}.pdf`
    );
  }
  if (request.command === "video-start") {
    return getArtifactPath(
      storageDir,
      sessionId,
      "videos",
      `${timestamp}-${request.id}.webm`
    );
  }
  return undefined;
}
