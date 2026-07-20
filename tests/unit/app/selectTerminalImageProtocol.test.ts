import {expect, test} from "bun:test";
import {selectTerminalImageProtocol} from "../../../src/components/index.js";

const terminalInfo = {
  terminalWidth: 1200,
  terminalHeight: 800,
  cellWidth: 10,
  cellHeight: 20,
  supportsUnicode: true,
  supportsColor: true,
  supportsSixelGraphics: false,
  supportsKittyGraphics: false,
  supportsITerm2Graphics: false
};

test("prefers the iTerm2 protocol in iTerm2, WezTerm, and Warp", () => {
  for (const program of ["iTerm.app", "WezTerm", "WarpTerminal"]) {
    expect(
      selectTerminalImageProtocol(
        {
          ...terminalInfo,
          supportsITerm2Graphics: true,
          supportsKittyGraphics: true
        },
        {TERM_PROGRAM: program}
      )
    ).toBe("iterm2");
  }
});

test("prefers the Kitty protocol in Ghostty and Kitty", () => {
  expect(
    selectTerminalImageProtocol(
      {...terminalInfo, supportsKittyGraphics: true},
      {TERM_PROGRAM: "ghostty"}
    )
  ).toBe("kitty");
  expect(
    selectTerminalImageProtocol(
      {...terminalInfo, supportsKittyGraphics: true},
      {TERM: "xterm-kitty"}
    )
  ).toBe("kitty");
});

test("honors the PARTERRE_IMAGE_PROTOCOL override", () => {
  expect(
    selectTerminalImageProtocol(terminalInfo, {
      PARTERRE_IMAGE_PROTOCOL: "sixel"
    })
  ).toBe("sixel");
});

test("uses native capabilities before text fallbacks", () => {
  expect(
    selectTerminalImageProtocol(
      {...terminalInfo, supportsKittyGraphics: true},
      {}
    )
  ).toBe("kitty");
  expect(
    selectTerminalImageProtocol(
      {...terminalInfo, supportsSixelGraphics: true},
      {}
    )
  ).toBe("sixel");
  expect(selectTerminalImageProtocol(terminalInfo, {})).toBe("halfBlock");
});
