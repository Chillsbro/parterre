import {useEffect, useState} from "react";

export function useStagedReveal(itemCount: number, intervalMs: number): number {
  const reduceMotion =
    process.env.PARTERRE_REDUCE_MOTION === "1" ||
    process.env.CI === "true" ||
    !process.stdout.isTTY;
  const [visibleCount, setVisibleCount] = useState(
    reduceMotion ? itemCount : 0
  );

  useEffect(() => {
    if (reduceMotion) {
      setVisibleCount(itemCount);
      return;
    }
    const timer = setInterval(() => {
      setVisibleCount(count => {
        if (count >= itemCount) {
          clearInterval(timer);
          return count;
        }
        return count + 1;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, itemCount, reduceMotion]);

  return visibleCount;
}
