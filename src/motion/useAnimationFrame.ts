import {useEffect, useState} from "react";

export function useAnimationFrame(
  frames: readonly string[],
  intervalMs: number,
  active = true
): string {
  const [frameIndex, setFrameIndex] = useState(0);
  const reduceMotion =
    process.env.PARTERRE_REDUCE_MOTION === "1" ||
    process.env.CI === "true" ||
    !process.stdout.isTTY;

  useEffect(() => {
    if (!active || reduceMotion || frames.length < 2) return;
    const timer = setInterval(() => {
      setFrameIndex(index => (index + 1) % frames.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, frames.length, intervalMs, reduceMotion]);

  return frames[reduceMotion ? 0 : frameIndex] ?? "";
}
