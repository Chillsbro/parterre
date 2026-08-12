import {expect, test} from "bun:test";
import {
  limitTimelineItems,
  maxRenderedTimelineItems,
  type TimelineItem
} from "../../../src/transcript/index.js";

function toolItems(count: number): TimelineItem[] {
  return Array.from({length: count}, (_, index) => ({
    id: `search-${index}`,
    kind: "tool" as const,
    content: `search-${index}`,
    ok: true
  }));
}

test("keeps short transcript histories unchanged", () => {
  const items = toolItems(maxRenderedTimelineItems);

  expect(limitTimelineItems(items)).toBe(items);
});

test("bounds rendered history while retaining the newest entries", () => {
  const items = toolItems(300);

  const limited = limitTimelineItems(items);

  expect(limited).toHaveLength(maxRenderedTimelineItems);
  expect(limited[0]).toEqual({
    id: "transcript-history-truncated",
    kind: "tool",
    content: "101 earlier transcript entries hidden",
    ok: true
  });
  expect(limited[1]?.id).toBe("search-101");
  expect(limited.at(-1)?.id).toBe("search-299");
  expect(items).toHaveLength(300);
});
