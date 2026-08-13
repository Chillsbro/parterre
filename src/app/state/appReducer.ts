import type {SessionEvent} from "../../sessions/index.js";
import type {AppAction, AppState} from "./AppState.js";

function deriveEventState(
  state: AppState,
  event: SessionEvent
): Partial<AppState> {
  if (event.type === "agent_turn_started") {
    const activeTurnIds = [...state.activeTurnIds, event.turnId];
    return {activeTurnIds, activeRequests: []};
  }
  if (
    event.type === "agent_turn_finished" ||
    event.type === "agent_interrupted"
  ) {
    const activeTurnIds = state.activeTurnIds.filter(id => id !== event.turnId);
    return {
      activeTurnIds,
      ...(event.type === "agent_interrupted"
        ? {
            activeRequests: [],
            pendingApproval: undefined,
            workspaceReview: undefined
          }
        : {})
    };
  }
  if (event.type === "playwright_started") {
    return {activeRequests: [...state.activeRequests, event.request]};
  }
  if (event.type === "playwright_finished") {
    return {
      activeRequests: state.activeRequests.filter(
        request => request.id !== event.result.request.id
      ),
      latestPageUrl: event.result.url ?? state.latestPageUrl,
      latestPageTitle: event.result.title ?? state.latestPageTitle,
      latestScreenshot:
        event.result.artifacts.find(path =>
          path.toLowerCase().endsWith(".png")
        ) ?? state.latestScreenshot
    };
  }
  if (event.type === "approval_requested") {
    return {pendingApproval: {request: event.request, reason: event.reason}};
  }
  if (event.type === "approval_resolved") {
    return {pendingApproval: undefined, workspaceReview: undefined};
  }
  if (event.type === "model_changed") return {currentModel: event.model};
  if (event.type === "process_error") return {lastProcessError: event.message};
  return {};
}

export function appReducer(state: AppState, action: AppAction): AppState {
  if (action.type === "status") return {...state, status: action.status};
  if (action.type === "liveFrame") {
    return {...state, latestScreenshot: action.path};
  }
  if (action.type === "workspaceReview") {
    return {...state, workspaceReview: action.review};
  }
  if (action.type === "input") return {...state, input: action.input};
  if (action.type === "toggleBrowserFocus") {
    return {...state, browserFocused: !state.browserFocused};
  }
  if (action.type === "clearApproval") {
    return {...state, pendingApproval: undefined, workspaceReview: undefined};
  }
  if (action.type === "clearEvents") {
    return {
      ...state,
      events: state.events.filter(event => event.type === "model_changed"),
      activeTurnIds: [],
      activeRequests: [],
      latestPageUrl: undefined,
      latestPageTitle: undefined,
      latestScreenshot: undefined,
      lastProcessError: undefined,
      workspaceReview: undefined
    };
  }

  return {
    ...state,
    ...deriveEventState(state, action.event),
    events: [...state.events.slice(-999), action.event]
  };
}
