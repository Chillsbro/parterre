import {Box, Text} from "ink";
import type React from "react";
import {matchSlashCommands, maxSlashCommandRows} from "../../commands/index.js";
import {parterreTheme} from "../../theme/index.js";

export function ActionBar(props: {input: string}): React.ReactElement {
  const activeCommand = props.input
    .trimStart()
    .split(/\s/, 1)[0]
    ?.toLowerCase();
  const matches = matchSlashCommands(props.input);
  const visible = matches.slice(0, maxSlashCommandRows);
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
      {matches.length > visible.length ? (
        <Text color={parterreTheme.faint}>…</Text>
      ) : null}
    </Box>
  );
}
