import type {TimelineItem} from "./TimelineItem.js";

export const maxRenderedTimelineItems = 200;

export function limitTimelineItems(items: TimelineItem[]): TimelineItem[] {
  if (items.length <= maxRenderedTimelineItems) return items;

  const retainedCount = maxRenderedTimelineItems - 1;
  const hiddenCount = items.length - retainedCount;
  return [
    {
      id: "transcript-history-truncated",
      kind: "tool",
      content: `${hiddenCount} earlier transcript entries hidden`,
      ok: true
    },
    ...items.slice(-retainedCount)
  ];
}
