import {expect, test} from "bun:test";
import {renderToString} from "ink";
import {
  Composer,
  computeComposerLayout,
  shouldCompactComposer
} from "../../../src/components/index.js";

test("uses a compact preview only for large or unusually spaced drafts", () => {
  expect(shouldCompactComposer("const answer = 42;")).toBe(false);
  expect(shouldCompactComposer("first line\nsecond line\nthird line")).toBe(
    false
  );
  expect(shouldCompactComposer(`left${" ".repeat(40)}right`)).toBe(true);

  const input = `const x = 1;\n\n${" ".repeat(40)}return x;`;
  const output = renderToString(
    <Composer
      input={input}
      height={3}
      compact
      disabled={false}
      onChange={() => {}}
      onSubmit={() => {}}
    />,
    {columns: 44}
  );
  expect(Bun.stripANSI(output).split("\n")).toHaveLength(3);
  expect(output).toContain(`Large input · 3 lines · ${input.length} chars`);
  expect(output).not.toContain("return x");
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
