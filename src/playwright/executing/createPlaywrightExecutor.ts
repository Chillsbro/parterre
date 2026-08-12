import type {PlaywrightResult} from "../../sessions/index.js";
import {getRequestedArtifactPath} from "../artifacts/index.js";
import type {PlaywrightRequest} from "../types/index.js";
import {executePlaywrightRequest} from "./executePlaywrightRequest.js";

export interface PlaywrightSessionOptions {
  command: string;
  workspace: string;
  playwrightSession: string;
  storageDir: string;
  sessionId: string;
}

export type PlaywrightExecutor = (
  request: PlaywrightRequest
) => Promise<PlaywrightResult>;

export function createPlaywrightExecutor(
  options: PlaywrightSessionOptions
): PlaywrightExecutor {
  let activeVideoRecordingPath: string | undefined;
  return async request => {
    const videoRecordingPath =
      request.command === "video-start"
        ? getRequestedArtifactPath(
            options.storageDir,
            options.sessionId,
            request
          )
        : activeVideoRecordingPath;
    const result = await executePlaywrightRequest({
      ...options,
      request,
      ...(videoRecordingPath ? {videoRecordingPath} : {})
    });
    if (request.command === "video-start" && result.ok) {
      activeVideoRecordingPath = videoRecordingPath;
    }
    if (request.command === "video-stop" && result.ok) {
      activeVideoRecordingPath = undefined;
    }
    return result;
  };
}
