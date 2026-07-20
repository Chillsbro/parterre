import {expect, test} from "bun:test";
import {
  curtainGapHalfWidth,
  easeInOutCubic,
  sliceSegments
} from "../../../src/motion/index.js";

test("cubic easing is pinned at the ends and symmetric in the middle", () => {
  expect(easeInOutCubic(0)).toBe(0);
  expect(easeInOutCubic(1)).toBe(1);
  expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  expect(easeInOutCubic(-1)).toBe(0);
  expect(easeInOutCubic(2)).toBe(1);
});

test("curtain is closed at rest and fully open at the end, on every row", () => {
  for (let row = 0; row < 12; row += 1) {
    expect(curtainGapHalfWidth(0, row, 76)).toBe(0);
    expect(curtainGapHalfWidth(1, row, 76)).toBe(38);
  }
});

test("curtain sways while moving but never closes past zero", () => {
  const gaps = Array.from({length: 12}, (_, row) =>
    curtainGapHalfWidth(0.5, row, 76)
  );
  expect(Math.max(...gaps)).not.toBe(Math.min(...gaps));
  for (const gap of gaps) {
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(38);
  }
});

test("slicing segments preserves colors and cuts at exact columns", () => {
  const row = [
    {text: "aaaa", color: "red"},
    {text: "bbbb", color: "green"},
    {text: "cccc", color: "blue"}
  ];
  expect(sliceSegments(row, 2, 10)).toEqual([
    {text: "aa", color: "red"},
    {text: "bbbb", color: "green"},
    {text: "cc", color: "blue"}
  ]);
  expect(sliceSegments(row, 0, 12)).toEqual(row);
  expect(sliceSegments(row, 5, 5)).toEqual([]);
});
