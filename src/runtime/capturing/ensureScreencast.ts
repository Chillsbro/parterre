import type {RuntimeContext} from "../types/index.js";
import {startScreencast} from "./startScreencast.js";

export async function ensureScreencast(context: RuntimeContext): Promise<void> {
  if (context.state.screencast || context.isStopped()) return;
  try {
    context.state.screencast = await startScreencast({
      storageDir: context.config.storageDir,
      sessionId: context.sessionId,
      format: context.frameFormat,
      onFrame: path => {
        if (!context.isStopped()) {
          context.onNotification({type: "liveFrame", path});
        }
      },
      onEnd: () => {
        context.state.screencast = undefined;
      }
    });
  } catch (error) {
    void context.publish({
      type: "process_error",
      timestamp: new Date().toISOString(),
      source: "playwright",
      message: `Live view unavailable, falling back to action snapshots: ${
        error instanceof Error ? error.message : String(error)
      }`
    });
  }
}
