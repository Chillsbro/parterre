import {expect, test} from "bun:test";
import {
  compactContentLabel,
  computeComposerLayout,
  shouldCompactComposer
} from "../../../src/app/layout/index.js";

test("uses a compact preview only for large or unusually spaced drafts", () => {
  expect(shouldCompactComposer("const answer = 42;")).toBe(false);
  expect(shouldCompactComposer("first line\nsecond line\nthird line")).toBe(
    false
  );
  expect(shouldCompactComposer(`left${" ".repeat(40)}right`)).toBe(true);

  const input = `const x = 1;\n\n${" ".repeat(40)}return x;`;
  expect(compactContentLabel(input)).toBe(
    `Large input · 3 lines · ${input.length} chars`
  );
});

test("computes additional composer rows for wrapped and multiline drafts", () => {
  expect(computeComposerLayout("short", 44)).toEqual({
    height: 3,
    compact: false
  });
  expect(computeComposerLayout("a".repeat(39), 44)).toEqual({
    height: 4,
    compact: false
  });
  expect(computeComposerLayout("first\nsecond", 44)).toEqual({
    height: 4,
    compact: false
  });
  expect(computeComposerLayout("a".repeat(267), 44)).toEqual({
    height: 3,
    compact: true
  });
});
