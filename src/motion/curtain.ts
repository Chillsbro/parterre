export interface TextSegment {
  text: string;
  color: string;
}

export function easeInOutCubic(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
}

export function curtainGapHalfWidth(
  progress: number,
  row: number,
  width: number
): number {
  const eased = easeInOutCubic(progress);
  const envelope = 4 * eased * (1 - eased);
  const sway = Math.sin(row * 0.7 + progress * 10) * 2 * envelope;
  return Math.min(width / 2, Math.max(0, eased * (width / 2 + 3) + sway));
}

export function sliceSegments(
  segments: readonly TextSegment[],
  start: number,
  end: number
): TextSegment[] {
  const sliced: TextSegment[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const segmentStart = cursor;
    const segmentEnd = cursor + segment.text.length;
    cursor = segmentEnd;
    if (segmentEnd <= start || segmentStart >= end) continue;
    const text = segment.text.slice(
      Math.max(0, start - segmentStart),
      Math.min(segment.text.length, end - segmentStart)
    );
    if (text) sliced.push({text, color: segment.color});
  }
  return sliced;
}
