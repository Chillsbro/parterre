import {Box, Text, useInput, usePaste} from "ink";
import TextInput from "ink-text-input";
import type React from "react";
import {parterreTheme} from "../../theme/index.js";

const unusuallyWideWhitespace = /[\t ]{16,}/;
const compactCharacterCount = 400;
const compactLineCount = 8;

export function shouldCompactComposer(input: string): boolean {
  const lineCount = input.split(/\r\n|\r|\n/).length;
  return (
    input.length >= compactCharacterCount ||
    lineCount >= compactLineCount ||
    unusuallyWideWhitespace.test(input)
  );
}

export function compactContentLabel(input: string): string {
  const lineCount = input.split(/\r\n|\r|\n/).length;
  return `Large input · ${lineCount} ${lineCount === 1 ? "line" : "lines"} · ${input.length} chars`;
}

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
  const compact = shouldCompactComposer(props.input);
  return (
    <Box
      height={3}
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
      {compact ? (
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
