import {extname} from "node:path";
import {pathToFileURL} from "node:url";
import type {SessionEvent} from "../sessions/index.js";
import {limitTimelineItems} from "./limitTimelineItems.js";
import type {TimelineItem} from "./TimelineItem.js";

export function buildTimelineItems(events: SessionEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const event of events) {
    if (event.type === "user_message") {
      items.push({id: event.id, kind: "user", content: event.content});
      continue;
    }
    if (event.type === "process_error") {
      items.push({
        id: `${event.timestamp}-${event.source}`,
        kind: "error",
        content: event.message
      });
      continue;
    }
    if (event.type === "model_changed") {
      items.push({
        id: `${event.timestamp}-model`,
        kind: "tool",
        content: `model → ${event.model}`,
        ok: true
      });
      continue;
    }
    if (event.type === "agent_interrupted") {
      items.push({
        id: `${event.turnId}-interrupted`,
        kind: "tool",
        content: "Agent interrupted",
        ok: true
      });
      continue;
    }
    if (event.type === "session_resumed") {
      items.push({
        id: `${event.timestamp}-resumed`,
        kind: "tool",
        content: `Session resumed with ${event.provider}`,
        detail: `${event.mode} context, ${event.browser} browser restore`,
        ok: true
      });
      continue;
    }
    if (event.type === "browser_restore_warning") {
      items.push({
        id: `${event.timestamp}-browser-restore-warning`,
        kind: "tool",
        content: "Browser profile restore warning",
        detail: event.message,
        ok: false
      });
      continue;
    }
    if (
      event.type === "agent_turn_started" ||
      event.type === "agent_turn_finished"
    ) {
      continue;
    }
    if (event.type === "playwright_finished") {
      items.push({
        id: event.result.request.id,
        kind: "tool",
        content: event.result.request.command,
        detail: `${event.result.durationMs}ms`,
        ok: event.result.ok
      });
      for (const artifact of event.result.artifacts) {
        if (extname(artifact).toLowerCase() !== ".webm") continue;
        items.push({
          id: `${event.result.request.id}-${artifact}`,
          kind: "tool",
          content: "Video recorded — view ",
          link: {label: "here", href: pathToFileURL(artifact).href},
          ok: true
        });
      }
      continue;
    }
    if (event.type === "target_test_finished") {
      if (!event.result.ok) {
        items.push({
          id: `${event.timestamp}-target-test`,
          kind: "error",
          content: event.result.error
        });
        continue;
      }
      items.push({
        id: `${event.timestamp}-target-test`,
        kind: "tool",
        content: "Automation test written — view ",
        detail: event.result.timedOut
          ? `timed out (exit ${event.result.exitCode})`
          : `exit ${event.result.exitCode}`,
        link: {
          label: event.result.path,
          href: pathToFileURL(event.result.path).href
        },
        ok: event.result.passed
      });
      continue;
    }
    if (event.type !== "agent_message") continue;
    if (event.message.type === "status") {
      items.push({
        id: `${event.timestamp}-status`,
        kind: "tool",
        content: event.message.message,
        ok: true
      });
      continue;
    }
    if (event.message.type === "error") {
      items.push({
        id: `${event.timestamp}-agent-error`,
        kind: "error",
        content: event.message.message
      });
      continue;
    }
    if (event.message.type === "assistant_delta") {
      const previous = items.at(-1);
      if (previous?.id === event.message.id && previous.kind === "agent") {
        previous.content += event.message.delta;
      } else {
        items.push({
          id: event.message.id,
          kind: "agent",
          content: event.message.delta
        });
      }
      continue;
    }
    if (event.message.type === "assistant_message") {
      const previous = items.at(-1);
      if (previous?.id === event.message.id && previous.kind === "agent") {
        previous.content = event.message.content;
      } else {
        items.push({
          id: event.message.id,
          kind: "agent",
          content: event.message.content
        });
      }
    }
  }
  return limitTimelineItems(items);
}
