import {Box, Text} from "ink";
import {useTerminalInfo} from "ink-picture";
import type React from "react";
import {parterreTheme} from "../../theme/index.js";
import {selectTerminalImageProtocol} from "../Browser/index.js";

function Keybinding(props: {keys: string; label: string}): React.ReactElement {
  return (
    <Box>
      <Text color={parterreTheme.faint}>{props.keys}</Text>
      <Text color={parterreTheme.muted}> {props.label}</Text>
    </Box>
  );
}

export function StatusBar(props: {
  browserOpen: boolean;
  browserFocused: boolean;
  status: string;
  pageUrl: string | undefined;
  model: string;
}): React.ReactElement {
  const protocol = selectTerminalImageProtocol(useTerminalInfo());
  const degraded =
    protocol === "halfBlock" || protocol === "braille" || protocol === "ascii";
  return (
    <Box
      paddingX={2}
      gap={2}
      borderStyle="single"
      borderColor={parterreTheme.borderSoft}
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    >
      <Box gap={1} flexShrink={0}>
        <Text
          color={
            props.browserOpen ? parterreTheme.success : parterreTheme.border
          }
        >
          {props.browserOpen ? "●" : "○"}
        </Text>
        <Text color={parterreTheme.muted}>
          {props.browserOpen ? "connected" : "waiting"}
        </Text>
      </Box>
      <Box flexGrow={1} justifyContent="center">
        {props.pageUrl ? (
          <Text color={parterreTheme.faint} wrap="truncate-middle">
            {props.pageUrl}
          </Text>
        ) : null}
      </Box>
      {props.status === "running" ? (
        <Box gap={2} flexShrink={0}>
          {degraded ? (
            <Text color={parterreTheme.warning}>▦ mosaic</Text>
          ) : null}
          <Box gap={1}>
            <Text color={parterreTheme.gold}>❖</Text>
            <Text color={parterreTheme.muted}>{props.model}</Text>
          </Box>
          <Keybinding
            keys="⌃B"
            label={props.browserFocused ? "panels" : "browser"}
          />
          <Keybinding keys="⌃C" label="quit" />
        </Box>
      ) : (
        <Text color={parterreTheme.muted}>{props.status}</Text>
      )}
    </Box>
  );
}
