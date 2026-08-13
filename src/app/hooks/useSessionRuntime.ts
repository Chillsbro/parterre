import {type Dispatch, useCallback, useEffect, useRef} from "react";
import type {AppConfig} from "../../config/index.js";
import {
  createSessionRuntime,
  type FrameFormat,
  type RuntimeController
} from "../../runtime/index.js";
import type {AppAction} from "../state/index.js";

export interface LiveFrameSink {
  frameFormat: FrameFormat;
  onLiveFrame(path: string): void;
}

export function useSessionRuntime(
  config: AppConfig,
  dispatch: Dispatch<AppAction>,
  createRuntime: typeof createSessionRuntime = createSessionRuntime,
  liveFrames?: LiveFrameSink,
  resumeSessionId?: string
): {
  runtimeRef: {current: RuntimeController | undefined};
  stopRuntime: () => Promise<void>;
  reportHostError: (error: unknown) => void;
} {
  const runtimeRef = useRef<RuntimeController | undefined>(undefined);
  const runtimePromiseRef = useRef<Promise<RuntimeController> | undefined>(
    undefined
  );
  const stopPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const stoppingRef = useRef(false);

  const reportHostError = useCallback(
    (error: unknown): void => {
      dispatch({
        type: "event",
        event: {
          type: "process_error",
          timestamp: new Date().toISOString(),
          source: "host",
          message: error instanceof Error ? error.message : String(error)
        }
      });
    },
    [dispatch]
  );

  const stopRuntime = useCallback(async (): Promise<void> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    stoppingRef.current = true;
    stopPromiseRef.current = (async () => {
      let runtime = runtimeRef.current;
      if (!runtime && runtimePromiseRef.current) {
        try {
          runtime = await runtimePromiseRef.current;
        } catch {
          return;
        }
      }
      await runtime?.stop();
    })();
    return stopPromiseRef.current;
  }, []);

  useEffect(() => {
    let mounted = true;
    const runtimePromise = createRuntime({
      config,
      ...(liveFrames ? {frameFormat: liveFrames.frameFormat} : {}),
      ...(resumeSessionId ? {resumeSessionId} : {}),
      onNotification: notification => {
        if (!mounted) return;
        if (notification.type === "liveFrame") {
          if (liveFrames) liveFrames.onLiveFrame(notification.path);
          else dispatch({type: "liveFrame", path: notification.path});
          return;
        }
        dispatch(
          notification.type === "event"
            ? {type: "event", event: notification.event}
            : {type: "status", status: notification.status}
        );
      }
    });
    runtimePromiseRef.current = runtimePromise;
    void runtimePromise
      .then(runtime => {
        if (stoppingRef.current || !mounted) return runtime.stop();
        runtimeRef.current = runtime;
        void runtime.isWorkspaceProfileStale().then(stale => {
          if (!stale || !mounted) return;
          dispatch({
            type: "event",
            event: {
              type: "agent_message",
              timestamp: new Date().toISOString(),
              message: {
                type: "status",
                message:
                  "The workspace codebase profile is over a day old. Run /learn refresh to update it."
              }
            }
          });
        }, reportHostError);
        return undefined;
      })
      .catch(error => {
        dispatch({type: "status", status: "failed"});
        reportHostError(error);
      });
    return () => {
      mounted = false;
      void stopRuntime().catch(error => {
        process.stderr.write(
          `${error instanceof Error ? error.message : String(error)}\n`
        );
      });
    };
  }, [
    config,
    createRuntime,
    dispatch,
    liveFrames,
    reportHostError,
    resumeSessionId,
    stopRuntime
  ]);

  return {runtimeRef, stopRuntime, reportHostError};
}
