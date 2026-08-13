import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import type {AppConfig} from "../../config/index.js";
import {appendSessionEvent, type SessionEvent} from "../../sessions/index.js";
import {createApprovalGate} from "../approvals/index.js";
import type {
  FrameFormat,
  RuntimeContext,
  RuntimeNotification
} from "../types/index.js";

export function createRuntimeContext(options: {
  config: AppConfig;
  onNotification: (notification: RuntimeNotification) => void;
  frameFormat?: FrameFormat;
  liveFrames?: boolean;
  sessionId?: string | undefined;
  playwrightSession?: string | undefined;
  browserOpened?: boolean | undefined;
  releaseSessionLease?: (() => Promise<void>) | undefined;
}): RuntimeContext {
  const sessionId =
    options.sessionId ??
    `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  let queueTail: Promise<void> = Promise.resolve();
  let stopped = false;
  let stopPromise: Promise<void> | undefined;

  const publish = (event: SessionEvent): Promise<void> => {
    const write = queueTail.then(async () => {
      await appendSessionEvent(
        options.config.storageDir,
        sessionId,
        event,
        options.config.redactions
      );
      options.onNotification({type: "event", event});
    });
    queueTail = write.catch(() => {});
    return write;
  };

  return {
    config: options.config,
    frameFormat: options.frameFormat ?? "jpeg",
    liveFrames: options.liveFrames ?? true,
    sessionId,
    playwrightSession:
      options.playwrightSession ?? `tui-${randomUUID().slice(0, 8)}`,
    approvals: createApprovalGate(publish),
    authorizedCodebaseRoots: new Set([resolve(options.config.workspace)]),
    state: {
      browserOpened: options.browserOpened ?? false,
      screencast: undefined
    },
    onNotification: options.onNotification,
    publish,
    flush: () => queueTail,
    isStopped: () => stopped,
    beginStop(runCleanup) {
      if (stopPromise) return stopPromise;
      stopped = true;
      stopPromise = runCleanup();
      return stopPromise;
    },
    ...(options.releaseSessionLease
      ? {releaseSessionLease: options.releaseSessionLease}
      : {})
  };
}
