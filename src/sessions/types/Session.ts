import type {PlaywrightRequest} from "../../playwright/index.js";

export type AgentMessage =
  | {type: "assistant_delta"; id: string; delta: string}
  | {type: "assistant_message"; id: string; content: string}
  | {type: "status"; message: string}
  | {type: "error"; message: string};

export type SessionStatus = "starting" | "running" | "stopped" | "failed";

export interface SessionMetadata {
  schemaVersion: 2;
  id: string;
  createdAt: string;
  updatedAt: string;
  workspace: string;
  agent: string;
  model: string;
  playwrightSession: string;
  status: SessionStatus;
}

export interface PlaywrightResult {
  request: PlaywrightRequest;
  ok: boolean;
  output: string;
  error?: string;
  artifacts: string[];
  durationMs: number;
  url?: string;
  title?: string;
}

export type SessionEvent =
  | {
      type: "session_started" | "session_stopped";
      timestamp: string;
      message?: string;
    }
  | {type: "user_message"; timestamp: string; id: string; content: string}
  | {type: "agent_message"; timestamp: string; message: AgentMessage}
  | {
      type: "agent_turn_started" | "agent_turn_finished" | "agent_interrupted";
      timestamp: string;
      turnId: string;
    }
  | {type: "playwright_started"; timestamp: string; request: PlaywrightRequest}
  | {type: "playwright_finished"; timestamp: string; result: PlaywrightResult}
  | {
      type: "approval_requested";
      timestamp: string;
      request: PlaywrightRequest;
      reason: string;
    }
  | {
      type: "approval_resolved";
      timestamp: string;
      requestId: string;
      approved: boolean;
    }
  | {type: "model_changed"; timestamp: string; model: string}
  | {
      type: "process_error";
      timestamp: string;
      source: "agent" | "playwright" | "host";
      message: string;
    };
