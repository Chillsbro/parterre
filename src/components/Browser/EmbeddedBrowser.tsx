import React from "react";
import type {FramePainter} from "../../terminal/index.js";
import {BrowserSurface} from "./BrowserSurface.js";

export const EmbeddedBrowser = React.memo(function EmbeddedBrowser(props: {
  screenshotPath: string | undefined;
  pageUrl: string | undefined;
  pageTitle: string | undefined;
  width: number;
  height: number;
  painter?: FramePainter | undefined;
  liveView?: boolean | undefined;
}): React.ReactElement {
  return <BrowserSurface {...props} />;
});
