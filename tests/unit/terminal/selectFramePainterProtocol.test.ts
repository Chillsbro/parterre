import {expect, test} from "bun:test";
import type {TerminalGraphicsInfo} from "../../../src/terminal/index.js";
import {selectFramePainterProtocol} from "../../../src/terminal/index.js";

function graphics(
  overrides: Partial<TerminalGraphicsInfo> = {}
): TerminalGraphicsInfo {
  return {
    cellWidth: 10,
    cellHeight: 20,
    terminalWidth: 800,
    terminalHeight: 480,
    supportsKittyGraphics: false,
    ...overrides
  };
}

test("selects kitty when the terminal speaks kitty graphics", () => {
  expect(
    selectFramePainterProtocol(graphics({supportsKittyGraphics: true}), {})
  ).toBe("kitty");
});

test("does not select a painter without Kitty graphics", () => {
  expect(
    selectFramePainterProtocol(graphics(), {TERM_PROGRAM: "unsupported"})
  ).toBeUndefined();
  expect(selectFramePainterProtocol(graphics(), {})).toBeUndefined();
});

test("allows an explicit Kitty override", () => {
  expect(
    selectFramePainterProtocol(graphics(), {PARTERRE_IMAGE_PROTOCOL: "kitty"})
  ).toBe("kitty");
});
