import {Box, Text, useInput, usePaste} from "ink";
import TextInput from "ink-text-input";
import type React from "react";
import {parterreTheme} from "../../theme/index.js";
import {compactContentLabel} from "./computeComposerLayout.js";

function CompactInput(props: {
  value: string;
  disabled: boolean;
  onChange: (input: string) => void;
  onSubmit: (input: string) => void;
}): React.ReactElement {
  useInput(
    (input, key) => {
      if (key.return) {
        props.onSubmit(props.value);
        return;
      }
      if (key.backspace || key.delete) {
        props.onChange(Array.from(props.value).slice(0, -1).join(""));
        return;
      }
      if (
        key.upArrow ||
        key.downArrow ||
        key.leftArrow ||
        key.rightArrow ||
        key.tab ||
        (key.ctrl && input === "c")
      ) {
        return;
      }
      props.onChange(`${props.value}${input}`);
    },
    {isActive: !props.disabled}
  );
  return (
    <Text color={parterreTheme.muted} wrap="truncate-end">
      {compactContentLabel(props.value)}
    </Text>
  );
}

export function Composer(props: {
  input: string;
  height: number;
  compact: boolean;
  disabled: boolean;
  onChange: (input: string) => void;
  onSubmit: (input: string) => void;
}): React.ReactElement {
  usePaste(
    pasted => {
      props.onChange(`${props.input}${pasted}`);
    },
    {isActive: !props.disabled}
  );
  return (
    <Box
      height={props.height}
      flexShrink={0}
      overflow="hidden"
      borderStyle="round"
      borderColor={
        props.disabled ? parterreTheme.borderSoft : parterreTheme.accentMuted
      }
      paddingX={1}
    >
      <Text color={props.disabled ? parterreTheme.faint : parterreTheme.accent}>
        ❯{" "}
      </Text>
      {props.compact ? (
        <CompactInput
          value={props.input}
          disabled={props.disabled}
          onChange={props.onChange}
          onSubmit={props.onSubmit}
        />
      ) : (
        <TextInput
          value={props.input}
          placeholder={props.disabled ? "Starting…" : "Describe a task, or /"}
          focus={!props.disabled}
          showCursor={!props.disabled}
          highlightPastedText
          onChange={props.onChange}
          onSubmit={props.onSubmit}
        />
      )}
    </Box>
  );
}
