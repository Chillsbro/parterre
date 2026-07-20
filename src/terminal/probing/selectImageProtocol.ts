export type TerminalImageProtocol =
  | "kitty"
  | "iterm2"
  | "sixel"
  | "halfBlock"
  | "braille"
  | "ascii";

export interface GraphicsCapabilities {
  supportsKittyGraphics: boolean;
  supportsITerm2Graphics: boolean;
  supportsSixelGraphics: boolean;
  supportsUnicode?: boolean | undefined;
  supportsColor?: boolean | undefined;
}

const protocolNames: ReadonlySet<TerminalImageProtocol> = new Set([
  "kitty",
  "iterm2",
  "sixel",
  "halfBlock",
  "braille",
  "ascii"
]);

export function selectImageProtocol(
  capabilities: GraphicsCapabilities,
  env: NodeJS.ProcessEnv = process.env
): TerminalImageProtocol {
  const override = env.PARTERRE_IMAGE_PROTOCOL;
  if (override && protocolNames.has(override as TerminalImageProtocol)) {
    return override as TerminalImageProtocol;
  }
  if (
    (env.TERM_PROGRAM === "iTerm.app" ||
      env.TERM_PROGRAM === "WezTerm" ||
      env.TERM_PROGRAM === "WarpTerminal") &&
    capabilities.supportsITerm2Graphics
  ) {
    return "iterm2";
  }
  if (
    (env.TERM_PROGRAM === "ghostty" ||
      env.TERM === "xterm-kitty" ||
      env.TERM === "xterm-ghostty") &&
    capabilities.supportsKittyGraphics
  ) {
    return "kitty";
  }
  if (capabilities.supportsKittyGraphics) return "kitty";
  if (capabilities.supportsITerm2Graphics) return "iterm2";
  if (capabilities.supportsSixelGraphics) return "sixel";
  if (capabilities.supportsUnicode && capabilities.supportsColor) {
    return "halfBlock";
  }
  if (capabilities.supportsUnicode) return "braille";
  return "ascii";
}
