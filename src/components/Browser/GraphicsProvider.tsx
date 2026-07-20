import {InkPictureProvider, type TerminalInfo} from "ink-picture";
import React from "react";
import type {TerminalGraphicsInfo} from "../../terminal/index.js";

export function GraphicsProvider(props: {
  graphics: TerminalGraphicsInfo;
  children: React.ReactNode;
}): React.ReactElement {
  const terminalInfo: TerminalInfo = React.useMemo(
    () => ({
      ...props.graphics,
      supportsUnicode: true,
      supportsColor: true
    }),
    [props.graphics]
  );
  return (
    <InkPictureProvider terminalInfo={terminalInfo}>
      {props.children}
    </InkPictureProvider>
  );
}
