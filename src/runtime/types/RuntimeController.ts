import type {SessionEvent} from "../../sessions/index.js";
import type {WorkspaceWriteProposal} from "../../workspace/index.js";

export interface WorkspaceReview extends WorkspaceWriteProposal {
  requestId: string;
}

export type RuntimeNotification =
  | {type: "event"; event: SessionEvent}
  | {type: "liveFrame"; path: string}
  | {type: "workspaceReview"; review: WorkspaceReview | undefined}
  | {type: "status"; status: "starting" | "running" | "stopped" | "failed"};

export interface ModelChoice {
  id: string;
  name: string;
  multiplier?: number;
}

export interface RuntimeController {
  sendUserMessage(
    content: string,
    waitForResponse?: boolean,
    displayContent?: string
  ): Promise<void>;
  interrupt(): Promise<boolean>;
  resolveApproval(requestId: string, approved: boolean): Promise<void>;
  listModels(): Promise<ModelChoice[]>;
  setModel(modelId: string): Promise<void>;
  clearTranscript(): Promise<void>;
  authorizeCodebaseRoot(path: string): string;
  clearCodebaseProfile(path: string): Promise<void>;
  isWorkspaceProfileStale(): Promise<boolean>;
  stop(): Promise<void>;
}
