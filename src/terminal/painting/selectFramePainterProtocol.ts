import type {TerminalGraphicsInfo} from "../probing/index.js";

export function selectFramePainterProtocol(
  graphics: TerminalGraphicsInfo,
  env: NodeJS.ProcessEnv = process.env
): "kitty" | undefined {
  if (env.PARTERRE_IMAGE_PROTOCOL === "kitty") return "kitty";
  return graphics.supportsKittyGraphics ? "kitty" : undefined;
}
