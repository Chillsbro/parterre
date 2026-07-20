import type {TimelineItem} from "../../transcript/index.js";

export function formatTimelineItem(item: TimelineItem): string {
  if (item.kind === "user") return `You: ${item.content}`;
  if (item.kind === "agent") return `Agent: ${item.content}`;
  if (item.kind === "error") return `Error: ${item.content}`;
  const status = item.ok === false ? "ERROR" : "OK";
  const detail = item.detail ? ` (${item.detail})` : "";
  return `${status} ${item.content}${detail}`;
}
