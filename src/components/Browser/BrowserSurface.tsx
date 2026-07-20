import {Box, Text} from "ink";
import Image, {useTerminalInfo} from "ink-picture";
import type React from "react";
import type {FramePainter} from "../../terminal/index.js";
import {parterreTheme} from "../../theme/index.js";
import {Panel} from "../Layout/index.js";
import {selectTerminalImageProtocol} from "./selectTerminalImageProtocol.js";
import {useFramePainterRegion} from "./useFramePainterRegion.js";

function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function BrowserSurface(props: {
  screenshotPath: string | undefined;
  pageUrl: string | undefined;
  pageTitle: string | undefined;
  width: number;
  height: number;
  painter?: FramePainter | undefined;
  liveView?: boolean | undefined;
}): React.ReactElement {
  const protocol = selectTerminalImageProtocol(useTerminalInfo());
  const {painter} = props;
  const contentRef = useFramePainterRegion(painter);

  const degraded =
    protocol === "halfBlock" || protocol === "braille" || protocol === "ascii";
  const open = Boolean(props.pageUrl);
  const label = props.pageTitle ?? hostnameOf(props.pageUrl) ?? "browser";
  const liveViewActive = Boolean(painter && props.liveView);
  return (
    <Box marginX={1}>
      <Panel
        width={props.width - 2}
        height={props.height}
        borderColor={parterreTheme.border}
        title={
          <>
            <Text
              color={open ? parterreTheme.success : parterreTheme.borderSoft}
            >
              {open ? "●" : "◌"}
            </Text>
            <Text
              bold={open}
              color={open ? parterreTheme.text : parterreTheme.faint}
            >
              {" "}
              {label}
            </Text>
          </>
        }
      >
        <Box ref={contentRef} flexGrow={1} flexDirection="column">
          {liveViewActive ? null : props.screenshotPath ? (
            <Image
              src={props.screenshotPath}
              width={Math.max(1, props.width - 4)}
              height={Math.max(1, props.height - 2)}
              objectFit="contain"
              protocol={protocol}
              getVisibility={() => "full"}
              alt=" "
            />
          ) : (
            <Box
              flexGrow={1}
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
            >
              <Text color={parterreTheme.gold}>❖</Text>
              <Box marginTop={1}>
                <Text color={parterreTheme.faint}>
                  The page appears here once the agent browses.
                </Text>
              </Box>
              {degraded ? (
                <Box marginTop={1} paddingX={2}>
                  <Text color={parterreTheme.faint} wrap="wrap">
                    Rendering in mosaic mode. For crisp frames use iTerm2,
                    Kitty, Ghostty, or WezTerm — or enable your terminal&apos;s
                    inline images.
                  </Text>
                </Box>
              ) : null}
            </Box>
          )}
        </Box>
      </Panel>
    </Box>
  );
}
