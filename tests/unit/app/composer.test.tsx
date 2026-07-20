import {expect, test} from "bun:test";
import {renderToString} from "ink";
import {
  Composer,
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
