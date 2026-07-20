import {Box, Text, useApp, useInput, useStdout, useWindowSize} from "ink";
import type React from "react";
import {useEffect, useMemo, useReducer, useRef, useState} from "react";
import {matchSlashCommands} from "../commands/index.js";
import {
  ActionBar,
  ApprovalDialog,
  Composer,
  EmbeddedBrowser,
  GraphicsProvider,
  ModelPicker,
  StartupScreen,
  StatusBar,
  Transcript,
  type TranscriptScrollHandle,
  useFramePainterRepaint
} from "../components/index.js";
import type {AppConfig} from "../config/index.js";
import type {createSessionRuntime} from "../runtime/index.js";
import {
  createFramePainter,
  frameFormatFor,
  type MouseWheelEvent,
  selectFramePainterProtocol,
  type TerminalGraphicsInfo
} from "../terminal/index.js";
import {parterreTheme} from "../theme/index.js";
import {buildTimelineItems} from "../transcript/index.js";
import {useModelPicker, useSessionRuntime} from "./hooks/index.js";
import {computeAppLayout} from "./layout/index.js";
import {selectAgentActivity} from "./selectors/index.js";
import {createSendMessage} from "./sending/index.js";
import {appReducer, initialAppState} from "./state/index.js";

export function App(props: {
  config: AppConfig;
  graphics: TerminalGraphicsInfo;
  subscribeWheel?:
    | ((listener: (event: MouseWheelEvent) => void) => () => void)
    | undefined;
  createRuntime?: typeof createSessionRuntime | undefined;
}): React.ReactElement {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [showStartup, setShowStartup] = useState(true);
  const [liveViewActive, setLiveViewActive] = useState(false);
  const transcriptScrollRef = useRef<TranscriptScrollHandle | null>(null);
  const {exit} = useApp();
  const {stdout} = useStdout();
  const {columns, rows} = useWindowSize();
  const liveView = useMemo(() => {
    const protocol = selectFramePainterProtocol(props.graphics);
    if (!protocol) return undefined;
    const painter = createFramePainter({
      protocol,
      cellWidth: props.graphics.cellWidth,
      cellHeight: props.graphics.cellHeight,
      stdout,
      onFirstFrame: () => setLiveViewActive(true)
    });
    return {
      painter,
      frames: {
        frameFormat: frameFormatFor(protocol),
        onLiveFrame: (path: string) => painter.submitFrame(path)
      }
    };
  }, [props.graphics, stdout]);
  useEffect(() => {
    return () => liveView?.painter.stop();
  }, [liveView]);
  useFramePainterRepaint(liveView?.painter);
  const {runtimeRef, stopRuntime, reportHostError} = useSessionRuntime(
    props.config,
    dispatch,
    props.createRuntime,
    liveView?.frames
  );
  const timelineItems = useMemo(
    () => buildTimelineItems(state.events),
    [state.events]
  );
  const activity = selectAgentActivity(state, props.config.provider);
  const currentModel = state.currentModel ?? props.config.model;
  const {modelPicker, openModelPicker, handleModelPickerInput} = useModelPicker(
    {runtimeRef, reportHostError, currentModel}
  );
  const commandMatches = matchSlashCommands(state.input);
  const layout = computeAppLayout({
    rows,
    columns,
    browserFocused: state.browserFocused,
    hasActivity: Boolean(activity),
    commandMatchCount: commandMatches.length,
    modelPickerCount: modelPicker?.models.length,
    pendingApproval: Boolean(state.pendingApproval)
  });

  useEffect(() => {
    return props.subscribeWheel?.(event => {
      transcriptScrollRef.current?.scrollLines(event.direction * 2);
    });
  }, [props.subscribeWheel]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      void stopRuntime().then(
        () => exit(),
        error => exit(error instanceof Error ? error : new Error(String(error)))
      );
      return;
    }
    if (key.ctrl && input === "b") {
      dispatch({type: "toggleBrowserFocus"});
      return;
    }
    if (key.pageUp || key.pageDown) {
      const scroller = transcriptScrollRef.current;
      if (key.pageUp) scroller?.pageUp();
      else scroller?.pageDown();
      return;
    }
    if (handleModelPickerInput(key)) return;
    if (!state.pendingApproval) return;
    if (input.toLowerCase() === "y" || input.toLowerCase() === "n") {
      const approved = input.toLowerCase() === "y";
      void runtimeRef.current?.resolveApproval(
        state.pendingApproval.request.id,
        approved
      );
      dispatch({type: "clearApproval"});
    }
  });

  const sendMessage = createSendMessage({
    runtimeRef,
    dispatch,
    stopRuntime,
    exit,
    openModelPicker,
    currentModel,
    reportHostError,
    workspace: props.config.workspace
  });

  if (showStartup) {
    return (
      <StartupScreen
        status={state.status}
        errorMessage={
          state.status === "failed" ? state.lastProcessError : undefined
        }
        onComplete={() => setShowStartup(false)}
      />
    );
  }

  return (
    <GraphicsProvider graphics={props.graphics}>
      <Box flexDirection="column" height={rows}>
        <Box height={layout.mainHeight}>
          {state.browserFocused ? null : (
            <Box
              flexDirection="column"
              width={layout.leftWidth}
              paddingLeft={1}
            >
              <Transcript
                items={timelineItems}
                height={layout.transcriptHeight}
                scrollRef={transcriptScrollRef}
              />
              {layout.activityHeight > 0 ? (
                <Box paddingX={1}>
                  <Text color={parterreTheme.accent}>◇ </Text>
                  <Text color={parterreTheme.muted} wrap="truncate-end">
                    {activity}
                  </Text>
                </Box>
              ) : null}
              {layout.showActionBar ? <ActionBar input={state.input} /> : null}
              {modelPicker ? (
                <ModelPicker
                  models={modelPicker.models}
                  index={modelPicker.index}
                  currentModel={currentModel}
                  loading={modelPicker.loading}
                />
              ) : state.pendingApproval ? (
                <ApprovalDialog
                  request={state.pendingApproval.request}
                  reason={state.pendingApproval.reason}
                />
              ) : (
                <Composer
                  input={state.input}
                  disabled={state.status !== "running"}
                  onChange={input => dispatch({type: "input", input})}
                  onSubmit={sendMessage}
                />
              )}
            </Box>
          )}
          <EmbeddedBrowser
            screenshotPath={state.latestScreenshot}
            pageUrl={state.latestPageUrl}
            pageTitle={state.latestPageTitle}
            width={layout.browserWidth}
            height={layout.mainHeight}
            painter={liveView?.painter}
            liveView={liveViewActive}
          />
        </Box>
        <StatusBar
          browserOpen={Boolean(state.latestPageUrl)}
          browserFocused={state.browserFocused}
          status={state.status}
          pageUrl={state.latestPageUrl}
          model={currentModel}
        />
      </Box>
    </GraphicsProvider>
  );
}
