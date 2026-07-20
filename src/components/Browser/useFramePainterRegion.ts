import type {DOMElement} from "ink";
import {type RefObject, useEffect, useRef} from "react";
import type {FramePainter} from "../../terminal/index.js";
import {measureFrameRegion} from "./measureFrameRegion.js";

export function useFramePainterRegion(
  painter: FramePainter | undefined
): RefObject<DOMElement | null> {
  const contentRef = useRef<DOMElement | null>(null);
  useEffect(() => {
    painter?.setRegion(measureFrameRegion(contentRef.current));
  });
  useEffect(() => {
    return () => painter?.setRegion(undefined);
  }, [painter]);
  return contentRef;
}
