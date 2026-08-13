import {Box, Text} from "ink";
import type React from "react";
import type {ApprovalRequest} from "../../sessions/index.js";
import {parterreTheme} from "../../theme/index.js";
import {Panel} from "../Layout/index.js";

export function ApprovalDialog(props: {
  request: ApprovalRequest;
  reason: string;
}): React.ReactElement {
  return (
    <Panel
      borderColor={parterreTheme.warning}
      paddingX={1}
      title={
        <Text bold color={parterreTheme.warning}>
          approval needed
        </Text>
      }
    >
      <Text color={parterreTheme.muted} wrap="wrap">
        {props.reason}
      </Text>
      <Text wrap="truncate-end">
        <Text bold color={parterreTheme.accentBright}>
          {props.request.command}
        </Text>
        <Text color={parterreTheme.text}> {props.request.args.join(" ")}</Text>
      </Text>
      <Box gap={2}>
        <Text>
          <Text bold color={parterreTheme.success}>
            Y
          </Text>
          <Text color={parterreTheme.muted}> approve</Text>
        </Text>
        <Text>
          <Text bold color={parterreTheme.error}>
            N
          </Text>
          <Text color={parterreTheme.muted}> deny</Text>
        </Text>
      </Box>
    </Panel>
  );
}
