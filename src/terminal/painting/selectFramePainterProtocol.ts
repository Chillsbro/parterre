import {
  selectImageProtocol,
  type TerminalGraphicsInfo
} from "../probing/index.js";
import type {FramePainterProtocol} from "./createFramePainter.js";

export function selectFramePainterProtocol(
  graphics: TerminalGraphicsInfo,
  env: NodeJS.ProcessEnv = process.env
): FramePainterProtocol | undefined {
  const protocol = selectImageProtocol(graphics, env);
  return protocol === "kitty" || protocol === "iterm2" ? protocol : undefined;
}
