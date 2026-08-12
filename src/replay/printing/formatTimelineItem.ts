import {formatTerminalHyperlink} from "../../terminal/formatTerminalHyperlink.js";
import type {TimelineItem} from "../../transcript/index.js";

export function formatTimelineItem(item: TimelineItem): string {
  if (item.kind === "user") return `You: ${item.content}`;
  if (item.kind === "agent") return `Agent: ${item.content}`;
  if (item.kind === "error") return `Error: ${item.content}`;
  const status = item.ok === false ? "ERROR" : "OK";
  const detail = item.detail ? ` (${item.detail})` : "";
  const link = item.link ? formatTerminalHyperlink(item.link) : "";
  return `${status} ${item.content}${link}${detail}`;
}
