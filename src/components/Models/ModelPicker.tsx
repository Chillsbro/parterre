import {Box, Text} from "ink";
import type React from "react";
import type {ModelChoice} from "../../runtime/index.js";
import {parterreTheme} from "../../theme/index.js";
import {Panel} from "../Layout/index.js";

const visibleRows = 8;

export function ModelPicker(props: {
  models: ModelChoice[];
  index: number;
  currentModel: string;
  loading: boolean;
}): React.ReactElement {
  const start = Math.max(
    0,
    Math.min(
      props.index - Math.floor(visibleRows / 2),
      props.models.length - visibleRows
    )
  );
  const visible = props.models.slice(start, start + visibleRows);
  return (
    <Panel
      borderColor={parterreTheme.accent}
      paddingX={1}
      title={
        <Text bold color={parterreTheme.accent}>
          models
        </Text>
      }
    >
      {props.loading ? (
        <Text color={parterreTheme.muted}>Fetching the programme…</Text>
      ) : props.models.length === 0 ? (
        <Text color={parterreTheme.muted}>No models available.</Text>
      ) : (
        visible.map((model, offset) => {
          const selected = start + offset === props.index;
          const active = model.id === props.currentModel;
          return (
            <Box key={model.id} gap={1}>
              <Text
                color={
                  selected ? parterreTheme.accentBright : parterreTheme.faint
                }
              >
                {selected ? "❯" : " "}
              </Text>
              <Text
                bold={selected}
                color={selected ? parterreTheme.text : parterreTheme.muted}
                wrap="truncate-end"
              >
                {model.name}
              </Text>
              {model.multiplier !== undefined ? (
                <Text color={parterreTheme.faint}>{model.multiplier}×</Text>
              ) : null}
              {active ? (
                <Text color={parterreTheme.success}>·active</Text>
              ) : null}
            </Box>
          );
        })
      )}
      <Text color={parterreTheme.faint}>↑↓ choose ⏎ switch esc cancel</Text>
    </Panel>
  );
}
