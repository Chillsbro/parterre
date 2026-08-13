import {
  curtainGapHalfWidth,
  sliceSegments,
  type TextSegment
} from "../../motion/curtain.js";
import {parterreTheme} from "../../theme/index.js";

export const resumeStartupNotice =
  "Warning: resuming this persistent browser profile may restore authenticated website state.";

export function createStartupStatus(
  status: "starting" | "running" | "stopped" | "failed",
  spinner: string,
  errorMessage?: string
): string {
  if (status === "starting") return `${spinner} Raising the curtain`;
  if (status === "failed") {
    return `✗ Could not start${errorMessage ? ` · ${errorMessage}` : ""}`;
  }
  return "✓ Ready";
}

const letterforms: ReadonlyArray<readonly string[]> = [
  ["╔══╗", "║  ║", "╠══╝", "║   ", "╨   "],
  ["╔══╗", "║  ║", "╠══╣", "║  ║", "╨  ╨"],
  ["╔══╗", "║  ║", "╠═╦╝", "║ ╚╗", "╨  ╨"],
  ["╔╦╗", " ║ ", " ║ ", " ║ ", " ╨ "],
  ["╔═══", "║   ", "╠══ ", "║   ", "╚═══"],
  ["╔══╗", "║  ║", "╠═╦╝", "║ ╚╗", "╨  ╨"],
  ["╔══╗", "║  ║", "╠═╦╝", "║ ╚╗", "╨  ╨"],
  ["╔═══", "║   ", "╠══ ", "║   ", "╚═══"]
];

const tagline = "BROWSER IN RESIDENCE".split("").join(" ");
const wordmarkRowColors = [
  parterreTheme.goldBright,
  parterreTheme.gold,
  parterreTheme.gold,
  parterreTheme.goldDeep,
  parterreTheme.goldDeep
] as const;
const pleats = ["▓", "▓", "▒", "▓", "▒", "▒"] as const;
const strands = ["┋", "┆"] as const;

function centered(
  width: number,
  content: string
): {left: string; right: string} {
  const remaining = Math.max(0, width - content.length);
  const left = Math.floor(remaining / 2);
  return {left: " ".repeat(left), right: " ".repeat(remaining - left)};
}

function cloth(
  pattern: readonly string[],
  fromColumn: number,
  toColumn: number
): string {
  let woven = "";
  for (let column = fromColumn; column < toColumn; column += 1) {
    woven += pattern[column % pattern.length];
  }
  return woven;
}

type CurtainRowKind = "velvet" | "heading" | "fringe";

function wingSegments(
  kind: CurtainRowKind,
  side: "left" | "right",
  fromColumn: number,
  toColumn: number
): TextSegment[] {
  if (toColumn <= fromColumn) return [];
  if (kind === "heading") {
    return [
      {text: "▄".repeat(toColumn - fromColumn), color: parterreTheme.goldBright}
    ];
  }
  if (kind === "fringe") {
    return [
      {text: cloth(strands, fromColumn, toColumn), color: parterreTheme.gold}
    ];
  }
  const body: TextSegment = {
    text: cloth(
      pleats,
      side === "left" ? fromColumn : fromColumn + 1,
      side === "left" ? toColumn - 1 : toColumn
    ),
    color: parterreTheme.accentMuted
  };
  const hem: TextSegment = {
    text: side === "left" ? "▐" : "▌",
    color: parterreTheme.goldDeep
  };
  return side === "left" ? [body, hem] : [hem, body];
}

export function getParterreLogoRows(): TextSegment[][] {
  const wordmarkRows = Array.from({length: 5}, (_, row) =>
    letterforms.map(letter => letter[row]).join("  ")
  );
  const innerWidth =
    Math.max(wordmarkRows[0]?.length ?? 0, tagline.length + 4) + 10;
  const frame = parterreTheme.goldDeep;
  const rows: TextSegment[][] = [];

  rows.push([{text: `╔${"═".repeat(innerWidth)}╗`, color: frame}]);
  rows.push([{text: `║${" ".repeat(innerWidth)}║`, color: frame}]);
  for (const [index, row] of wordmarkRows.entries()) {
    const pad = centered(innerWidth, row);
    rows.push([
      {text: "║", color: frame},
      {text: pad.left, color: frame},
      {text: row, color: wordmarkRowColors[index] ?? parterreTheme.gold},
      {text: pad.right, color: frame},
      {text: "║", color: frame}
    ]);
  }
  rows.push([{text: `║${" ".repeat(innerWidth)}║`, color: frame}]);
  const taglineContent = `❖ ${tagline}`;
  const pad = centered(innerWidth, taglineContent);
  rows.push([
    {text: "║", color: frame},
    {text: pad.left, color: frame},
    {text: "❖", color: parterreTheme.accent},
    {text: ` ${tagline}`, color: parterreTheme.muted},
    {text: pad.right, color: frame},
    {text: "║", color: frame}
  ]);
  rows.push([{text: `║${" ".repeat(innerWidth)}║`, color: frame}]);
  rows.push([{text: `╚${"═".repeat(innerWidth)}╝`, color: frame}]);
  return rows;
}

export function createCurtainRows(
  requestedWidth: number,
  progress: number
): TextSegment[][] {
  const logoRows = getParterreLogoRows();
  const logoWidth = logoRows.reduce(
    (width, row) =>
      Math.max(
        width,
        row.reduce((total, segment) => total + segment.text.length, 0)
      ),
    0
  );
  const width = Math.max(requestedWidth, logoWidth);
  const leftPad = Math.floor((width - logoWidth) / 2);
  const blank = (): TextSegment[] => [
    {text: " ".repeat(width), color: parterreTheme.background}
  ];
  const stage: Array<{segments: TextSegment[]; kind: CurtainRowKind}> = [
    {segments: blank(), kind: "velvet"},
    ...logoRows.map(row => ({
      segments: [
        {text: " ".repeat(leftPad), color: parterreTheme.background},
        ...row,
        {
          text: " ".repeat(width - leftPad - logoWidth),
          color: parterreTheme.background
        }
      ],
      kind: "velvet" as const
    })),
    {segments: blank(), kind: "velvet"},
    {segments: blank(), kind: "heading"},
    {segments: blank(), kind: "fringe"}
  ];

  return stage.map((row, rowIndex) => {
    const gapHalf = curtainGapHalfWidth(progress, rowIndex, width);
    const center = width / 2;
    const leftEdge = Math.round(center - gapHalf);
    const rightEdge = Math.round(center + gapHalf);
    if (leftEdge <= 0 && rightEdge >= width) return row.segments;
    return [
      ...wingSegments(row.kind, "left", 0, leftEdge),
      ...sliceSegments(row.segments, leftEdge, rightEdge),
      ...wingSegments(row.kind, "right", rightEdge, width)
    ];
  });
}
