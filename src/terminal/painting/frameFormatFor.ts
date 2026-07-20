import type {FramePainterProtocol} from "./createFramePainter.js";

export function frameFormatFor(protocol: FramePainterProtocol): "png" | "jpeg" {
  return protocol === "kitty" ? "png" : "jpeg";
}
