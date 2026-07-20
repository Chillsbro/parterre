import {Box, Text} from "ink";
import type React from "react";

export function Panel(props: {
  title: React.ReactNode;
  borderColor: string;
  width?: number | undefined;
  height?: number | undefined;
  paddingX?: number | undefined;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={props.borderColor}
      {...(props.width !== undefined ? {width: props.width} : {})}
      {...(props.height !== undefined ? {height: props.height} : {})}
      {...(props.paddingX !== undefined ? {paddingX: props.paddingX} : {})}
    >
      <Box marginTop={-1} marginLeft={1} flexShrink={0}>
        <Text> </Text>
        {props.title}
        <Text> </Text>
      </Box>
      {props.children}
    </Box>
  );
}
