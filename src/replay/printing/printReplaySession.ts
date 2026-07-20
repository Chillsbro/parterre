import type {SessionEvent} from "../../sessions/index.js";
import {buildTimelineItems} from "../../transcript/index.js";
import {formatTimelineItem} from "./formatTimelineItem.js";

export function printReplaySession(
  sessionId: string,
  events: SessionEvent[]
): void {
  process.stdout.write(`Session replay: ${sessionId}\n`);
  for (const item of buildTimelineItems(events)) {
    process.stdout.write(`${formatTimelineItem(item)}\n`);
  }
}
