import type {ProviderName} from "../../config/index.js";
import type {AppState} from "../state/index.js";

const providerLabels: Record<ProviderName, string> = {
  auto: "an authenticated provider",
  codex: "Codex",
  copilot: "Copilot",
  claude: "Claude Code",
  openai: "the model endpoint"
};

export function selectAgentActivity(
  state: AppState,
  provider: ProviderName
): string | undefined {
  if (state.status === "starting") {
    return `Connecting to ${providerLabels[provider]}`;
  }
  if (state.status !== "running") return undefined;
  if (state.activeTurnIds.length === 0) return undefined;

  const activeRequest = state.activeRequests.at(-1);
  if (activeRequest) return `Using browser / ${activeRequest.command}`;
  const latestEvent = state.events.at(-1);
  if (
    latestEvent?.type === "agent_message" &&
    latestEvent.message.type === "assistant_delta"
  ) {
    return "Writing response";
  }
  return "Thinking";
}
