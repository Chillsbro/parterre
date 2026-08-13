const unusuallyWideWhitespace = /[\t ]{16,}/;
const compactCharacterCount = 400;
const compactRowThreshold = 8;
const composerChromeWidth = 6;
export const compactComposerHeight = 3;

export interface ComposerLayout {
  height: number;
  compact: boolean;
}

function splitComposerLines(input: string): string[] {
  return input.split(/\r\n|\r|\n/);
}

export function shouldCompactComposer(input: string): boolean {
  const lineCount = splitComposerLines(input).length;
  return (
    input.length >= compactCharacterCount ||
    lineCount >= compactRowThreshold ||
    unusuallyWideWhitespace.test(input)
  );
}

export function compactContentLabel(input: string): string {
  const lineCount = splitComposerLines(input).length;
  return `Large input · ${lineCount} ${lineCount === 1 ? "line" : "lines"} · ${input.length} chars`;
}

function countWrappedRows(input: string, width: number): number {
  const contentWidth = Math.max(1, width - composerChromeWidth);
  const lines = splitComposerLines(input);
  return lines.reduce((total, line, index) => {
    const cursorWidth = index === lines.length - 1 ? 1 : 0;
    const lineWidth = Bun.stringWidth(line) + cursorWidth;
    return total + Math.max(1, Math.ceil(lineWidth / contentWidth));
  }, 0);
}

export function computeComposerLayout(
  input: string,
  width: number
): ComposerLayout {
  const contentRows = countWrappedRows(input, width);
  const compact =
    shouldCompactComposer(input) || contentRows >= compactRowThreshold;
  return {
    height: compact ? compactComposerHeight : contentRows + 2,
    compact
  };
}
