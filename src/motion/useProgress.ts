import {useEffect, useState} from "react";

export function useProgress(durationMs: number, delayMs = 0): number {
  const reduceMotion =
    process.env.PARTERRE_REDUCE_MOTION === "1" ||
    process.env.CI === "true" ||
    !process.stdout.isTTY;
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const startedAt = performance.now() + delayMs;
    const timer = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / durationMs;
      if (elapsed >= 1) {
        setProgress(1);
        clearInterval(timer);
      } else {
        setProgress(Math.max(0, elapsed));
      }
    }, 50);
    return () => clearInterval(timer);
  }, [durationMs, delayMs, reduceMotion]);

  return progress;
}
