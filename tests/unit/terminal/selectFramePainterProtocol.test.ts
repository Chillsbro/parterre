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
    supportsSixelGraphics: false,
    supportsKittyGraphics: false,
    supportsITerm2Graphics: false,
    ...overrides
  };
}

test("selects kitty when the terminal speaks kitty graphics", () => {
  expect(
    selectFramePainterProtocol(graphics({supportsKittyGraphics: true}), {})
  ).toBe("kitty");
});

test("prefers iterm2 on iterm-family terminals that support it", () => {
  expect(
    selectFramePainterProtocol(
      graphics({supportsITerm2Graphics: true, supportsKittyGraphics: true}),
      {TERM_PROGRAM: "iTerm.app"}
    )
  ).toBe("iterm2");
});

test("returns undefined for degraded terminals", () => {
  expect(selectFramePainterProtocol(graphics(), {})).toBeUndefined();
  expect(
    selectFramePainterProtocol(graphics({supportsSixelGraphics: true}), {})
  ).toBeUndefined();
});

test("honors the protocol override, including forcing the painter off", () => {
  expect(
    selectFramePainterProtocol(graphics(), {PARTERRE_IMAGE_PROTOCOL: "kitty"})
  ).toBe("kitty");
  expect(
    selectFramePainterProtocol(graphics({supportsKittyGraphics: true}), {
      PARTERRE_IMAGE_PROTOCOL: "halfBlock"
    })
  ).toBeUndefined();
});
