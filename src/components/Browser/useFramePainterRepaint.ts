import {useEffect} from "react";
import type {FramePainter} from "../../terminal/index.js";

export function useFramePainterRepaint(
  painter: FramePainter | undefined
): void {
  useEffect(() => {
    painter?.repaint();
  });
}
