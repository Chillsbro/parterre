import {Box, Text} from "ink";
import type React from "react";
import {matchSlashCommands, maxSlashCommandRows} from "../../commands/index.js";
import {parterreTheme} from "../../theme/index.js";

export function ActionBar(props: {
  input: string;
  maxHeight?: number;
}): React.ReactElement {
  const activeCommand = props.input
    .trimStart()
    .split(/\s/, 1)[0]
    ?.toLowerCase();
  const matches = matchSlashCommands(props.input);
  const maxHeight = props.maxHeight ?? maxSlashCommandRows + 1;
  const showOverflow = matches.length > maxHeight;
  const visible = matches.slice(
    0,
    Math.min(maxSlashCommandRows, maxHeight - (showOverflow ? 1 : 0))
  );
  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map(item => {
        const active = item.command === activeCommand;
        return (
          <Box key={item.command} gap={1}>
            <Text
              bold={active}
              color={active ? parterreTheme.accentBright : parterreTheme.accent}
            >
              {item.command}
            </Text>
            <Text color={parterreTheme.faint} wrap="truncate-end">
              {item.label}
            </Text>
          </Box>
        );
      })}
      {showOverflow ? <Text color={parterreTheme.faint}>…</Text> : null}
    </Box>
  );
}
