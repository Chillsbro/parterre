import type {AppConfig} from "../../config/index.js";
import type {SessionEvent} from "../../sessions/index.js";
import type {ApprovalGate} from "../approvals/index.js";
import type {ScreencastHandle} from "../capturing/index.js";
import type {RuntimeNotification} from "./RuntimeController.js";

export type FrameFormat = "png" | "jpeg";

export interface RuntimeState {
  browserOpened: boolean;
  screencast: ScreencastHandle | undefined;
}

export interface RuntimeContext {
  config: AppConfig;
  frameFormat: FrameFormat;
  liveFrames: boolean;
  sessionId: string;
  playwrightSession: string;
  approvals: ApprovalGate;
  authorizedCodebaseRoots: Set<string>;
  state: RuntimeState;
  onNotification(notification: RuntimeNotification): void;
  publish(event: SessionEvent): Promise<void>;
  flush(): Promise<void>;
  isStopped(): boolean;
  beginStop(runCleanup: () => Promise<void>): Promise<void>;
  releaseSessionLease?: (() => Promise<void>) | undefined;
}
