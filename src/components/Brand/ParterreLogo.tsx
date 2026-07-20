import {Box, Text} from "ink";
import type React from "react";
import type {TextSegment} from "../../motion/index.js";
import {parterreTheme} from "../../theme/index.js";

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

function centered(
  width: number,
  content: string
): {left: string; right: string} {
  const remaining = Math.max(0, width - content.length);
  const left = Math.floor(remaining / 2);
  return {left: " ".repeat(left), right: " ".repeat(remaining - left)};
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

export function ParterreLogo(props: {compact: boolean}): React.ReactElement {
  if (props.compact) {
    return (
      <Box gap={1}>
        <Text color={parterreTheme.gold}>❖</Text>
        <Text color={parterreTheme.text}>parterre</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {getParterreLogoRows().map((segments, row) => (
        <Text key={row}>
          {segments.map((segment, index) => (
            <Text key={index} bold color={segment.color}>
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
