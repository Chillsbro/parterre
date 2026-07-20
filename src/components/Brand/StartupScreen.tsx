import {Box, Text, useWindowSize} from "ink";
import type React from "react";
import {useEffect} from "react";
import {useAnimationFrame, useProgress} from "../../motion/index.js";
import type {SessionStatus} from "../../sessions/index.js";
import {parterreTheme} from "../../theme/index.js";
import {CurtainReveal} from "./CurtainReveal.js";
import {ParterreLogo} from "./ParterreLogo.js";

const spinnerFrames = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏"
] as const;

export function StartupScreen(props: {
  status: SessionStatus;
  errorMessage: string | undefined;
  onComplete: () => void;
}): React.ReactElement {
  const {columns, rows} = useWindowSize();
  const compact = columns < 68;
  const progress = useProgress(3200, 500);
  const spinner = useAnimationFrame(
    spinnerFrames,
    70,
    props.status === "starting"
  );

  useEffect(() => {
    if (props.status !== "running" || progress < 1) return;
    const timer = setTimeout(props.onComplete, 400);
    return () => clearTimeout(timer);
  }, [props.onComplete, props.status, progress]);

  return (
    <Box
      flexDirection="column"
      height={rows}
      alignItems="center"
      justifyContent="center"
    >
      {compact ? (
        <ParterreLogo compact />
      ) : (
        <CurtainReveal width={Math.min(columns - 4, 76)} progress={progress} />
      )}
      <Box marginTop={1} gap={1}>
        <Text
          color={
            props.status === "failed"
              ? parterreTheme.error
              : props.status === "starting"
                ? parterreTheme.accent
                : parterreTheme.success
          }
        >
          {props.status === "starting"
            ? spinner
            : props.status === "failed"
              ? "✗"
              : "✓"}
        </Text>
        <Text color={parterreTheme.muted}>
          {props.status === "starting"
            ? "Raising the curtain"
            : props.status === "failed"
              ? "Could not start"
              : "Ready"}
        </Text>
      </Box>
      {props.status === "failed" && props.errorMessage ? (
        <Box
          marginTop={1}
          width={Math.min(columns - 8, 64)}
          justifyContent="center"
        >
          <Text color={parterreTheme.muted} wrap="wrap">
            {props.errorMessage}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
