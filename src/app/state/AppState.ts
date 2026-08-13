import type {PlaywrightRequest} from "../../playwright/index.js";
import type {WorkspaceReview} from "../../runtime/index.js";
import type {ApprovalRequest, SessionEvent} from "../../sessions/index.js";

export interface AppState {
  events: SessionEvent[];
  status: "starting" | "running" | "stopped" | "failed";
  input: string;
  browserFocused: boolean;
  activeTurnIds: string[];
  activeRequests: PlaywrightRequest[];
  latestPageUrl: string | undefined;
  latestPageTitle: string | undefined;
  latestScreenshot: string | undefined;
  currentModel: string | undefined;
  lastProcessError: string | undefined;
  pendingApproval:
    | {
        request: ApprovalRequest;
        reason: string;
      }
    | undefined;
  workspaceReview: WorkspaceReview | undefined;
}

export type AppAction =
  | {type: "event"; event: SessionEvent}
  | {type: "liveFrame"; path: string}
  | {type: "workspaceReview"; review: WorkspaceReview | undefined}
  | {type: "status"; status: AppState["status"]}
  | {type: "input"; input: string}
  | {type: "toggleBrowserFocus"}
  | {type: "clearApproval"}
  | {type: "clearEvents"};

export const initialAppState: AppState = {
  events: [],
  status: "starting",
  input: "",
  browserFocused: false,
  activeTurnIds: [],
  activeRequests: [],
  latestPageUrl: undefined,
  latestPageTitle: undefined,
  latestScreenshot: undefined,
  currentModel: undefined,
  lastProcessError: undefined,
  pendingApproval: undefined,
  workspaceReview: undefined
};
