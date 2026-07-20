import {Box, Text} from "ink";
import type React from "react";
import {useMemo} from "react";
import {
  curtainGapHalfWidth,
  sliceSegments,
  type TextSegment
} from "../../motion/index.js";
import {parterreTheme} from "../../theme/index.js";
import {getParterreLogoRows} from "./ParterreLogo.js";

const pleats = ["▓", "▓", "▒", "▓", "▒", "▒"] as const;
const strands = ["┋", "┆"] as const;

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

export function CurtainReveal(props: {
  width: number;
  progress: number;
}): React.ReactElement {
  const stage = useMemo(() => {
    const logoRows = getParterreLogoRows();
    const logoWidth = logoRows.reduce(
      (width, row) =>
        Math.max(
          width,
          row.reduce((total, segment) => total + segment.text.length, 0)
        ),
      0
    );
    const width = Math.max(props.width, logoWidth);
    const leftPad = Math.floor((width - logoWidth) / 2);
    const blank = (): TextSegment[] => [
      {text: " ".repeat(width), color: parterreTheme.background}
    ];
    const rows: Array<{segments: TextSegment[]; kind: CurtainRowKind}> = [
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
    return {rows, width};
  }, [props.width]);

  return (
    <Box flexDirection="column">
      {stage.rows.map((row, rowIndex) => {
        const gapHalf = curtainGapHalfWidth(
          props.progress,
          rowIndex,
          stage.width
        );
        const center = stage.width / 2;
        const leftEdge = Math.round(center - gapHalf);
        const rightEdge = Math.round(center + gapHalf);
        const open = leftEdge <= 0 && rightEdge >= stage.width;
        const visible = open
          ? row.segments
          : sliceSegments(row.segments, leftEdge, rightEdge);
        return (
          <Text key={rowIndex}>
            {open
              ? null
              : wingSegments(row.kind, "left", 0, leftEdge).map(
                  (segment, index) => (
                    <Text key={`l${index}`} color={segment.color}>
                      {segment.text}
                    </Text>
                  )
                )}
            {visible.map((segment, index) => (
              <Text key={index} bold color={segment.color}>
                {segment.text}
              </Text>
            ))}
            {open
              ? null
              : wingSegments(row.kind, "right", rightEdge, stage.width).map(
                  (segment, index) => (
                    <Text key={`r${index}`} color={segment.color}>
                      {segment.text}
                    </Text>
                  )
                )}
          </Text>
        );
      })}
    </Box>
  );
}
