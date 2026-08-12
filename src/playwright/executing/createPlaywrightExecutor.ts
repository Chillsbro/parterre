import type {PlaywrightResult} from "../../sessions/index.js";
import type {PlaywrightRequest} from "../types/index.js";
import {executePlaywrightRequest} from "./executePlaywrightRequest.js";

export interface PlaywrightSessionOptions {
  command: string;
  workspace: string;
  playwrightSession: string;
  storageDir: string;
  sessionId: string;
}

export interface PlaywrightExecutionOptions {
  videoRecordingPath?: string | undefined;
}

export type PlaywrightExecutor = (
  request: PlaywrightRequest,
  executionOptions?: PlaywrightExecutionOptions
) => Promise<PlaywrightResult>;

export function createPlaywrightExecutor(
  options: PlaywrightSessionOptions
): PlaywrightExecutor {
  return (request, executionOptions) =>
    executePlaywrightRequest({...options, request, ...executionOptions});
}
