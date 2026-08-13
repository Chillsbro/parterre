import {
  getSession,
  readSessionEvents,
  type SessionEvent,
  type SessionMetadata
} from "../../sessions/index.js";

const maxHistoryMessages = 100;
const maxHistoryCharacters = 100_000;

export interface ResumeConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionResumePlan {
  metadata: SessionMetadata;
  displayEvents: SessionEvent[];
  history: ResumeConversationMessage[];
  model: string;
  lastUrl?: string | undefined;
  mode: "provider" | "history";
}

const transientEventTypes = new Set<SessionEvent["type"]>([
  "agent_turn_started",
  "agent_turn_finished",
  "agent_interrupted",
  "playwright_started",
  "approval_requested",
  "approval_resolved"
]);

function buildHistory(events: SessionEvent[]): ResumeConversationMessage[] {
  interface TurnHistory {
    id: string;
    user?: string;
    assistants: string[];
  }
  const users = new Map<string, string>();
  const activeTurns: TurnHistory[] = [];
  const completedTurns: Array<
    [ResumeConversationMessage, ResumeConversationMessage]
  > = [];
  let legacyUser: string | undefined;
  for (const event of events) {
    if (event.type === "user_message") {
      users.set(event.id, event.content);
      legacyUser = event.content;
      continue;
    }
    if (event.type === "agent_turn_started") {
      const user = users.get(event.turnId);
      if (user) legacyUser = undefined;
      activeTurns.push({
        id: event.turnId,
        ...(user ? {user} : {}),
        assistants: []
      });
      continue;
    }
    if (event.type === "agent_message") {
      if (event.message.type !== "assistant_message") continue;
      const active = activeTurns[0];
      if (active) {
        active.assistants.push(event.message.content);
      } else if (legacyUser) {
        completedTurns.push([
          {role: "user", content: legacyUser},
          {role: "assistant", content: event.message.content}
        ]);
        legacyUser = undefined;
      }
      continue;
    }
    if (
      event.type === "agent_turn_finished" ||
      event.type === "agent_interrupted"
    ) {
      const index = activeTurns.findIndex(turn => turn.id === event.turnId);
      if (index < 0) continue;
      const [turn] = activeTurns.splice(index, 1);
      if (
        event.type === "agent_turn_finished" &&
        turn?.user &&
        turn.assistants.length > 0
      ) {
        completedTurns.push([
          {role: "user", content: turn.user},
          {role: "assistant", content: turn.assistants.join("\n\n")}
        ]);
      }
    }
  }
  const boundedPairs: ResumeConversationMessage[][] = [];
  let characters = 0;
  const recent = completedTurns.slice(-(maxHistoryMessages / 2));
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const pair = recent[index];
    if (!pair) continue;
    const [user, assistant] = pair;
    const remaining = maxHistoryCharacters - characters;
    if (remaining <= 0) break;
    const pairLength = user.content.length + assistant.content.length;
    if (pairLength <= remaining) {
      boundedPairs.push([user, assistant]);
      characters += pairLength;
      continue;
    }
    if (boundedPairs.length > 0) break;
    const userBudget = Math.min(user.content.length, Math.floor(remaining / 2));
    const assistantBudget = remaining - userBudget;
    boundedPairs.push([
      {...user, content: user.content.slice(-userBudget)},
      {...assistant, content: assistant.content.slice(-assistantBudget)}
    ]);
    characters = maxHistoryCharacters;
  }
  return boundedPairs.reverse().flat();
}

function resumableUrl(events: SessionEvent[]): string | undefined {
  const browserEvents = [...events]
    .reverse()
    .filter(
      (event): event is Extract<SessionEvent, {type: "playwright_finished"}> =>
        event.type === "playwright_finished" && event.result.ok
    );
  const latestBrowserEvent = browserEvents[0];
  if (
    latestBrowserEvent &&
    ["close", "detach", "delete-data"].includes(
      latestBrowserEvent.result.request.command
    )
  ) {
    return undefined;
  }
  const candidate = browserEvents.find(event => Boolean(event.result.url));
  if (!candidate?.result.url) {
    return undefined;
  }
  try {
    const url = new URL(candidate.result.url);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export async function prepareSessionResume(options: {
  storageDir: string;
  sessionId: string;
}): Promise<SessionResumePlan> {
  const metadata = await getSession(options.storageDir, options.sessionId);
  if (!metadata) throw new Error(`Unknown session: ${options.sessionId}`);
  if (metadata.schemaVersion !== 2 && metadata.schemaVersion !== 3) {
    throw new Error(
      `Session ${options.sessionId} uses unsupported schema ${metadata.schemaVersion}`
    );
  }
  const events = await readSessionEvents(options.storageDir, options.sessionId);
  const lastClearIndex = events.reduce(
    (index, event, candidate) =>
      event.type === "transcript_cleared" ? candidate : index,
    -1
  );
  const visibleEvents = events.slice(lastClearIndex + 1);
  const latestModel = [...events]
    .reverse()
    .find(event => event.type === "model_changed");
  return {
    metadata,
    displayEvents: visibleEvents.filter(
      event => !transientEventTypes.has(event.type)
    ),
    history: buildHistory(events),
    model:
      latestModel?.type === "model_changed"
        ? latestModel.model
        : metadata.model,
    ...(resumableUrl(events) ? {lastUrl: resumableUrl(events)} : {}),
    mode:
      metadata.providerSessionId &&
      ["codex", "copilot", "claude"].includes(metadata.agent)
        ? "provider"
        : "history"
  };
}
