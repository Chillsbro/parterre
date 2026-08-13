import {extname} from "node:path";
import {
  BoxRenderable,
  bold,
  CliRenderEvents,
  type CliRenderer,
  DiffRenderable,
  fg,
  getTreeSitterClient,
  type KeyEvent,
  link,
  type PasteEvent,
  pathToFiletype,
  ScrollBoxRenderable,
  StyledText,
  SyntaxStyle,
  TextareaRenderable,
  TextRenderable,
  t
} from "@opentui/core";
import {matchSlashCommands} from "../commands/index.js";
import type {AppConfig} from "../config/index.js";
import {
  createSessionRuntime,
  type FrameFormat,
  type RuntimeController,
  type RuntimeNotification,
  type WorkspaceReview
} from "../runtime/index.js";
import {
  createFramePainter,
  type FramePainter,
  selectFramePainterProtocol,
  type TerminalGraphicsInfo
} from "../terminal/index.js";
import {parterreTheme} from "../theme/index.js";
import {buildTimelineItems, type TimelineItem} from "../transcript/index.js";
import {
  createCurtainRows,
  createStartupStatus,
  resumeStartupNotice
} from "./branding/index.js";
import {
  compactContentLabel,
  computeAppLayout,
  shouldCompactComposer
} from "./layout/index.js";
import {createWorkspacePatch} from "./review/index.js";
import {selectAgentActivity} from "./selectors/index.js";
import {createSendMessage} from "./sending/index.js";
import {
  type AppAction,
  type AppState,
  appReducer,
  initialAppState
} from "./state/index.js";

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

export interface ParterreTui {
  waitUntilExit(): Promise<void>;
  stop(error?: Error): Promise<void>;
}

export interface ParterreTuiOptions {
  config: AppConfig;
  resumeSessionId?: string | undefined;
  graphics: TerminalGraphicsInfo;
  renderer: CliRenderer;
  createRuntime?: typeof createSessionRuntime | undefined;
  createPainter?: typeof createFramePainter | false | undefined;
  stdout?: NodeJS.WriteStream | undefined;
  skipStartup?: boolean | undefined;
}

interface ModelPickerState {
  models: Awaited<ReturnType<RuntimeController["listModels"]>>;
  index: number;
  loading: boolean;
}

interface ViewRefs {
  root: BoxRenderable;
  startup: BoxRenderable;
  workspace: BoxRenderable;
  main: BoxRenderable;
  left: BoxRenderable;
  transcript: ScrollBoxRenderable;
  activity: TextRenderable;
  commands: BoxRenderable;
  control: BoxRenderable;
  composerBox: BoxRenderable;
  composerPrefix: TextRenderable;
  composer: TextareaRenderable;
  compactComposer: TextRenderable;
  browser: BoxRenderable;
  browserContent: BoxRenderable;
  browserEmpty: TextRenderable;
  status: TextRenderable;
  review: BoxRenderable;
  reviewScroll: ScrollBoxRenderable;
  reviewDiff: DiffRenderable;
  reviewError: TextRenderable;
  reviewStatus: TextRenderable;
}

function styled(
  segments: Array<{text: string; color: string; bold?: boolean}>
): StyledText {
  return new StyledText(
    segments.map(segment => {
      const chunk = fg(segment.color)(segment.text);
      return segment.bold ? bold(chunk) : chunk;
    })
  );
}

function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function formatTimelineItem(item: TimelineItem): StyledText {
  if (item.kind === "user") {
    const content = shouldCompactComposer(item.content)
      ? compactContentLabel(item.content)
      : item.content;
    return new StyledText([
      fg(parterreTheme.gold)("you "),
      fg(parterreTheme.text)(content)
    ]);
  }
  if (item.kind === "agent") {
    return new StyledText([
      fg(parterreTheme.accent)("❖ "),
      fg(parterreTheme.text)(item.content),
      ...(item.link ? [link(item.link.href)(item.link.label)] : [])
    ]);
  }
  const status = item.ok === false ? "✗" : "✓";
  const color =
    item.kind === "error" || item.ok === false
      ? parterreTheme.error
      : parterreTheme.success;
  return new StyledText([
    fg(color)(`${status} `),
    fg(parterreTheme.muted)(item.content),
    ...(item.link ? [link(item.link.href)(item.link.label)] : []),
    ...(item.detail ? [fg(parterreTheme.faint)(` · ${item.detail}`)] : [])
  ]);
}

function clearChildren(container: BoxRenderable | ScrollBoxRenderable): void {
  for (const child of [...container.getChildren()]) child.destroyRecursively();
}

function reviewFiletype(review: WorkspaceReview): string | undefined {
  return (
    pathToFiletype(review.relativePath) ??
    pathToFiletype(`file${extname(review.relativePath)}`)
  );
}

class ParterreTuiApp implements ParterreTui {
  private state: AppState = initialAppState;
  private runtime: RuntimeController | undefined;
  private runtimePromise: Promise<RuntimeController> | undefined;
  private stopPromise: Promise<void> | undefined;
  private stopping = false;
  private exited = false;
  private exitError: Error | undefined;
  private resolveExit: (() => void) | undefined;
  private readonly exitPromise: Promise<void>;
  private painter: FramePainter | undefined;
  private refs: ViewRefs;
  private modelPicker: ModelPickerState | undefined;
  private commandMatches = matchSlashCommands("");
  private latestPaintedPath: string | undefined;
  private composerSync = false;
  private showStartup: boolean;
  private startupProgress: number;
  private startupStartedAt = performance.now();
  private startupTimer: ReturnType<typeof setInterval> | undefined;
  private spinnerIndex = 0;
  private lastPainterRegion = "";
  private painterSuspended = false;
  private transientControl: BoxRenderable | undefined;
  private composerCompact = false;
  private renderedEvents: AppState["events"] | undefined;
  private renderedReviewId: string | undefined;
  private reviewCanApprove = false;
  private reviewView: "unified" | "split" | undefined;
  private reviewWrap = false;
  private reviewHunkIndex = 0;
  private reviewStats = "";

  constructor(private readonly options: ParterreTuiOptions) {
    this.showStartup = !options.skipStartup;
    this.startupProgress = this.reduceMotion ? 1 : 0;
    this.exitPromise = new Promise(resolve => {
      this.resolveExit = resolve;
    });
    this.refs = this.buildView();
    this.options.renderer.root.add(this.refs.root);
    this.options.renderer.keyInput.on("keypress", this.handleKeyPress);
    this.options.renderer.keyInput.on("paste", this.handlePaste);
    this.options.renderer.on(CliRenderEvents.RESIZE, this.handleResize);
    this.options.renderer.on(CliRenderEvents.FRAME, this.handleRendererFrame);
    this.startPainter();
    this.startRuntime();
    this.startStartupAnimation();
    this.render();
  }

  private get reduceMotion(): boolean {
    return (
      this.options.skipStartup === true ||
      process.env.PARTERRE_REDUCE_MOTION === "1" ||
      process.env.CI === "true" ||
      !this.options.stdout?.isTTY
    );
  }

  private buildView(): ViewRefs {
    const {renderer} = this.options;
    const root = new BoxRenderable(renderer, {
      id: "parterre",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: parterreTheme.background
    });
    const startup = new BoxRenderable(renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center"
    });
    const workspace = new BoxRenderable(renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column"
    });
    const main = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      flexGrow: 1
    });
    const left = new BoxRenderable(renderer, {
      flexDirection: "column",
      paddingLeft: 1
    });
    const transcript = new ScrollBoxRenderable(renderer, {
      border: true,
      borderStyle: "rounded",
      borderColor: parterreTheme.borderSoft,
      title: "❖ parterre",
      titleColor: parterreTheme.gold,
      paddingX: 1,
      scrollY: true,
      scrollX: false,
      stickyScroll: true,
      stickyStart: "bottom",
      viewportCulling: true
    });
    const activity = new TextRenderable(renderer, {
      content: "",
      fg: parterreTheme.muted,
      height: 1,
      paddingX: 1,
      truncate: true
    });
    const commands = new BoxRenderable(renderer, {
      flexDirection: "column",
      overflow: "hidden"
    });
    const control = new BoxRenderable(renderer, {
      flexDirection: "column",
      overflow: "hidden"
    });
    const composerBox = new BoxRenderable(renderer, {
      flexDirection: "row",
      border: true,
      borderStyle: "rounded",
      borderColor: parterreTheme.accentMuted,
      paddingX: 1,
      overflow: "hidden"
    });
    const composerPrefix = new TextRenderable(renderer, {
      content: "❯ ",
      fg: parterreTheme.accent,
      width: 2,
      flexShrink: 0
    });
    const composer = new TextareaRenderable(renderer, {
      flexGrow: 1,
      height: "100%",
      textColor: parterreTheme.text,
      focusedTextColor: parterreTheme.text,
      placeholder: "Describe a task, or /",
      placeholderColor: parterreTheme.faint,
      wrapMode: "word",
      keyBindings: [
        {name: "return", action: "submit"},
        {name: "kpenter", action: "submit"},
        {name: "linefeed", action: "submit"},
        {name: "return", shift: true, action: "newline"},
        {name: "kpenter", shift: true, action: "newline"}
      ],
      onSubmit: () => this.submitComposer(),
      onContentChange: () => this.syncComposerInput()
    });
    const compactComposer = new TextRenderable(renderer, {
      content: "",
      fg: parterreTheme.muted,
      flexGrow: 1,
      height: 1,
      truncate: true
    });
    composerBox.add(composerPrefix);
    composerBox.add(composer);
    composerBox.add(compactComposer);
    control.add(composerBox);
    left.add(transcript);
    left.add(activity);
    left.add(commands);
    left.add(control);

    const browser = new BoxRenderable(renderer, {
      marginX: 1,
      border: true,
      borderStyle: "rounded",
      borderColor: parterreTheme.border,
      flexDirection: "column"
    });
    const browserContent = new BoxRenderable(renderer, {
      flexGrow: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center"
    });
    const browserEmpty = new TextRenderable(renderer, {
      content: "❖\n\nThe page appears here once the agent browses.",
      fg: parterreTheme.faint,
      wrapMode: "word",
      selectable: false
    });
    browserContent.add(browserEmpty);
    browser.add(browserContent);
    main.add(left);
    main.add(browser);

    const status = new TextRenderable(renderer, {
      height: 2,
      paddingX: 2,
      fg: parterreTheme.muted,
      truncate: true
    });
    workspace.add(main);
    workspace.add(status);

    const review = new BoxRenderable(renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      border: true,
      borderStyle: "rounded",
      borderColor: parterreTheme.warning,
      title: "workspace write review",
      titleColor: parterreTheme.warning,
      paddingX: 1
    });
    const reviewScroll = new ScrollBoxRenderable(renderer, {
      flexGrow: 1,
      width: "100%",
      scrollX: true,
      scrollY: true,
      viewportCulling: true
    });
    const reviewDiff = new DiffRenderable(renderer, {
      width: "100%",
      diff: "",
      view: "unified",
      syncScroll: true,
      wrapMode: "none",
      showLineNumbers: true,
      treeSitterClient: getTreeSitterClient(),
      syntaxStyle: SyntaxStyle.fromStyles({
        keyword: {fg: parterreTheme.accentBright, bold: true},
        string: {fg: parterreTheme.goldBright},
        comment: {fg: parterreTheme.faint, italic: true},
        number: {fg: parterreTheme.warning},
        type: {fg: parterreTheme.accent},
        function: {fg: parterreTheme.text}
      }),
      fg: parterreTheme.text,
      lineNumberFg: parterreTheme.faint,
      lineNumberBg: parterreTheme.background,
      addedBg: "#10291B",
      removedBg: "#321715",
      contextBg: parterreTheme.background,
      addedContentBg: "#164024",
      removedContentBg: "#4A1D19",
      addedSignColor: parterreTheme.success,
      removedSignColor: parterreTheme.error
    });
    const reviewStatus = new TextRenderable(renderer, {
      height: 2,
      content: "",
      fg: parterreTheme.muted,
      paddingX: 1,
      truncate: true
    });
    const reviewError = new TextRenderable(renderer, {
      flexGrow: 1,
      content: "",
      fg: parterreTheme.error,
      wrapMode: "word",
      padding: 2,
      visible: false
    });
    reviewScroll.add(reviewDiff);
    review.add(reviewScroll);
    review.add(reviewError);
    review.add(reviewStatus);

    root.add(startup);
    root.add(workspace);
    root.add(review);
    return {
      root,
      startup,
      workspace,
      main,
      left,
      transcript,
      activity,
      commands,
      control,
      composerBox,
      composerPrefix,
      composer,
      compactComposer,
      browser,
      browserContent,
      browserEmpty,
      status,
      review,
      reviewScroll,
      reviewDiff,
      reviewError,
      reviewStatus
    };
  }

  private startPainter(): void {
    if (this.options.createPainter === false) return;
    const protocol = selectFramePainterProtocol(this.options.graphics);
    if (!protocol) return;
    const createPainter = this.options.createPainter ?? createFramePainter;
    this.painter = createPainter({
      cellWidth: this.options.graphics.cellWidth,
      cellHeight: this.options.graphics.cellHeight,
      stdout: this.options.stdout ?? process.stdout,
      positioning: "absolute"
    });
  }

  private startRuntime(): void {
    const createRuntime = this.options.createRuntime ?? createSessionRuntime;
    const frameFormat: FrameFormat | undefined = this.painter
      ? "png"
      : undefined;
    const runtimePromise = createRuntime({
      config: this.options.config,
      liveFrames: Boolean(this.painter),
      ...(frameFormat ? {frameFormat} : {}),
      ...(this.options.resumeSessionId
        ? {resumeSessionId: this.options.resumeSessionId}
        : {}),
      onNotification: this.handleNotification
    });
    this.runtimePromise = runtimePromise;
    void runtimePromise.then(
      runtime => {
        if (this.stopping || this.exited) return runtime.stop();
        this.runtime = runtime;
        void runtime.isWorkspaceProfileStale().then(stale => {
          if (!stale || this.exited) return;
          this.dispatch({
            type: "event",
            event: {
              type: "agent_message",
              timestamp: new Date().toISOString(),
              message: {
                type: "status",
                message:
                  "The workspace codebase profile is over a day old. Run /learn refresh to update it."
              }
            }
          });
        }, this.reportHostError);
        return undefined;
      },
      error => {
        this.dispatch({type: "status", status: "failed"});
        this.reportHostError(error);
      }
    );
  }

  private handleNotification = (notification: RuntimeNotification): void => {
    if (this.exited) return;
    if (notification.type === "liveFrame") {
      if (this.painter) {
        this.latestPaintedPath = notification.path;
        this.painter.submitFrame(notification.path);
      } else {
        this.dispatch({type: "liveFrame", path: notification.path});
      }
      return;
    }
    if (notification.type === "workspaceReview") {
      this.dispatch({type: "workspaceReview", review: notification.review});
      return;
    }
    this.dispatch(
      notification.type === "event"
        ? {type: "event", event: notification.event}
        : {type: "status", status: notification.status}
    );
  };

  private reportHostError = (error: unknown): void => {
    this.dispatch({
      type: "event",
      event: {
        type: "process_error",
        timestamp: new Date().toISOString(),
        source: "host",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  };

  private dispatch(action: AppAction): void {
    this.state = appReducer(this.state, action);
    if (action.type === "input") {
      this.commandMatches = matchSlashCommands(action.input);
    }
    this.render();
  }

  private startStartupAnimation(): void {
    if (!this.showStartup) return;
    this.startupTimer = setInterval(
      () => {
        this.spinnerIndex = (this.spinnerIndex + 1) % spinnerFrames.length;
        if (!this.reduceMotion) {
          const elapsed = performance.now() - this.startupStartedAt - 500;
          this.startupProgress = Math.min(1, Math.max(0, elapsed / 3200));
        }
        if (this.state.status === "running" && this.startupProgress >= 1) {
          this.showStartup = false;
          if (this.startupTimer) clearInterval(this.startupTimer);
          this.startupTimer = undefined;
        }
        this.render();
      },
      this.reduceMotion ? 40 : 70
    );
  }

  private renderStartup(): void {
    clearChildren(this.refs.startup);
    const compact = this.options.renderer.width < 68;
    const rows = compact
      ? [
          [
            {text: "❖", color: parterreTheme.gold},
            {text: " parterre", color: parterreTheme.text}
          ]
        ]
      : createCurtainRows(
          Math.min(this.options.renderer.width - 4, 76),
          this.startupProgress
        );
    for (const row of rows) {
      this.refs.startup.add(
        new TextRenderable(this.options.renderer, {
          content: styled(row.map(segment => ({...segment, bold: true}))),
          height: 1
        })
      );
    }
    const status = createStartupStatus(
      this.state.status,
      spinnerFrames[this.spinnerIndex] ?? "⠋",
      this.state.lastProcessError
    );
    this.refs.startup.add(
      new TextRenderable(this.options.renderer, {
        content: status,
        fg:
          this.state.status === "failed"
            ? parterreTheme.error
            : this.state.status === "starting"
              ? parterreTheme.accent
              : parterreTheme.success,
        marginTop: 1,
        wrapMode: "word",
        maxWidth: Math.min(this.options.renderer.width - 8, 72)
      })
    );
    if (this.options.resumeSessionId) {
      this.refs.startup.add(
        new TextRenderable(this.options.renderer, {
          content: resumeStartupNotice,
          fg: parterreTheme.warning,
          marginTop: 1,
          wrapMode: "word",
          maxWidth: Math.min(this.options.renderer.width - 8, 72)
        })
      );
    }
  }

  private renderTranscript(): void {
    if (this.renderedEvents === this.state.events) return;
    this.renderedEvents = this.state.events;
    clearChildren(this.refs.transcript);
    const items = buildTimelineItems(this.state.events);
    if (items.length === 0) {
      this.refs.transcript.add(
        new TextRenderable(this.options.renderer, {
          content:
            "❖\n\nDescribe a task below. The agent's work and evidence appear here.",
          fg: parterreTheme.faint,
          wrapMode: "word",
          marginTop: 2
        })
      );
      return;
    }
    for (const item of items) {
      this.refs.transcript.add(
        new TextRenderable(this.options.renderer, {
          id: `timeline-${item.id}`,
          content: formatTimelineItem(item),
          wrapMode: "word",
          marginTop: 1,
          selectable: true
        })
      );
    }
  }

  private renderCommands(height: number): void {
    clearChildren(this.refs.commands);
    this.refs.commands.height = height;
    this.refs.commands.visible = height > 0;
    if (height <= 0) return;
    for (const command of this.commandMatches.slice(0, height)) {
      this.refs.commands.add(
        new TextRenderable(this.options.renderer, {
          content: t`${fg(parterreTheme.accent)(command.command)} ${fg(parterreTheme.muted)(command.label)} ${fg(parterreTheme.faint)(`→ ${command.result}`)}`,
          height: 1,
          truncate: true,
          paddingX: 1
        })
      );
    }
  }

  private renderModelPicker(): void {
    const picker = this.modelPicker;
    if (!picker) return;
    const panel = new BoxRenderable(this.options.renderer, {
      flexDirection: "column",
      border: true,
      borderStyle: "rounded",
      borderColor: parterreTheme.accent,
      title: "models",
      titleColor: parterreTheme.accent,
      paddingX: 1,
      height: "100%"
    });
    if (picker.loading) {
      panel.add(
        new TextRenderable(this.options.renderer, {
          content: "Fetching the programme…",
          fg: parterreTheme.muted
        })
      );
    } else if (picker.models.length === 0) {
      panel.add(
        new TextRenderable(this.options.renderer, {
          content: "No models available.",
          fg: parterreTheme.muted
        })
      );
    } else {
      const start = Math.max(
        0,
        Math.min(picker.index - 4, picker.models.length - 8)
      );
      for (const [offset, model] of picker.models
        .slice(start, start + 8)
        .entries()) {
        const selected = start + offset === picker.index;
        const active = model.id === this.currentModel;
        panel.add(
          new TextRenderable(this.options.renderer, {
            content: t`${fg(selected ? parterreTheme.accentBright : parterreTheme.faint)(selected ? "❯" : " ")} ${fg(selected ? parterreTheme.text : parterreTheme.muted)(model.name)}${model.multiplier !== undefined ? fg(parterreTheme.faint)(` ${model.multiplier}×`) : ""}${active ? fg(parterreTheme.success)(" ·active") : ""}`,
            height: 1,
            truncate: true
          })
        );
      }
    }
    panel.add(
      new TextRenderable(this.options.renderer, {
        content: "↑↓ choose  ⏎ switch  esc cancel",
        fg: parterreTheme.faint,
        height: 1
      })
    );
    this.showControl(panel);
  }

  private renderApproval(): void {
    const approval = this.state.pendingApproval;
    if (!approval) return;
    const panel = new BoxRenderable(this.options.renderer, {
      flexDirection: "column",
      border: true,
      borderStyle: "rounded",
      borderColor: parterreTheme.warning,
      title: "approval needed",
      titleColor: parterreTheme.warning,
      paddingX: 1,
      height: "100%"
    });
    panel.add(
      new TextRenderable(this.options.renderer, {
        content: approval.reason,
        fg: parterreTheme.muted,
        wrapMode: "word",
        height: 1,
        truncate: true
      })
    );
    panel.add(
      new TextRenderable(this.options.renderer, {
        content: t`${fg(parterreTheme.accentBright)(approval.request.command)} ${fg(parterreTheme.text)(approval.request.args.join(" "))}`,
        height: 1,
        truncate: true
      })
    );
    panel.add(
      new TextRenderable(this.options.renderer, {
        content: t`${fg(parterreTheme.success)("Y")} ${fg(parterreTheme.muted)("approve  ")}${fg(parterreTheme.error)("N")} ${fg(parterreTheme.muted)("deny")}`,
        height: 1
      })
    );
    this.showControl(panel);
  }

  private renderComposer(height: number, compact: boolean): void {
    this.showControl(this.refs.composerBox);
    this.composerCompact = compact;
    this.refs.composerBox.height = height;
    this.refs.composerBox.borderColor =
      this.state.status === "running"
        ? parterreTheme.accentMuted
        : parterreTheme.borderSoft;
    this.refs.composerPrefix.fg =
      this.state.status === "running"
        ? parterreTheme.accent
        : parterreTheme.faint;
    this.refs.composer.visible = !compact;
    this.refs.compactComposer.visible = compact;
    this.refs.compactComposer.content = compact
      ? compactContentLabel(this.state.input)
      : "";
    if (!compact && this.refs.composer.plainText !== this.state.input) {
      this.composerSync = true;
      this.refs.composer.setText(this.state.input);
      this.refs.composer.cursorOffset = this.state.input.length;
      this.composerSync = false;
    }
    if (this.state.status === "running" && !compact) this.refs.composer.focus();
    else this.refs.composer.blur();
  }

  private showControl(next: BoxRenderable): void {
    const current = this.refs.control.getChildren()[0];
    if (current === next) return;
    if (current) this.refs.control.remove(current);
    if (this.transientControl && this.transientControl !== next) {
      this.transientControl.destroyRecursively();
      this.transientControl = undefined;
    }
    if (next !== this.refs.composerBox) this.transientControl = next;
    this.refs.control.add(next);
  }

  private renderBrowser(): void {
    const open = Boolean(this.state.latestPageUrl);
    const label =
      this.state.latestPageTitle ??
      hostnameOf(this.state.latestPageUrl) ??
      "browser";
    this.refs.browser.title = `${open ? "●" : "◌"} ${label}`;
    this.refs.browser.titleColor = open
      ? parterreTheme.text
      : parterreTheme.faint;
    this.refs.browser.borderColor = parterreTheme.border;
    this.refs.browserEmpty.content = this.painter
      ? "❖\n\nThe page appears here once the agent browses."
      : "❖\n\nLive browser frames require Kitty graphics (Ghostty or Kitty).";
    this.refs.browserEmpty.visible = !this.painter || !this.latestPaintedPath;
  }

  private renderStatus(): void {
    const open = Boolean(this.state.latestPageUrl);
    const active = this.state.activeTurnIds.length > 0;
    const focusLabel = this.state.browserFocused ? "panels" : "browser";
    this.refs.status.content = t`${fg(open ? parterreTheme.success : parterreTheme.border)(open ? "●" : "○")} ${fg(parterreTheme.muted)(open ? "connected" : "waiting")}  ${fg(parterreTheme.faint)(this.state.latestPageUrl ?? "")}  ${!this.painter ? fg(parterreTheme.warning)("Kitty graphics required  ") : ""}${fg(parterreTheme.gold)("❖")} ${fg(parterreTheme.muted)(this.currentModel)}  ${fg(parterreTheme.faint)(`⌃B ${focusLabel}${active ? "  esc interrupt" : ""}  ⌃C quit`)}`;
  }

  private renderReview(review: WorkspaceReview): void {
    this.refs.review.title = `${review.action === "create" ? "create" : "replace"} ${review.relativePath}`;
    if (this.renderedReviewId !== review.requestId) {
      this.renderedReviewId = review.requestId;
      this.reviewView = undefined;
      this.reviewWrap = false;
      this.reviewHunkIndex = 0;
      const result = createWorkspacePatch(review);
      this.reviewCanApprove = result.ok;
      this.refs.reviewScroll.visible = result.ok;
      this.refs.reviewError.visible = !result.ok;
      if (result.ok) {
        this.reviewStats = `+${result.additions} −${result.deletions}`;
        this.refs.reviewError.content = "";
        this.refs.reviewDiff.diff = result.patch;
        this.refs.reviewDiff.height = Math.max(
          1,
          result.patch.split("\n").length
        );
        this.refs.reviewDiff.filetype = reviewFiletype(review);
        this.refs.reviewScroll.scrollTo(0);
      } else {
        this.reviewStats = "diff unavailable";
        this.refs.reviewDiff.diff = "";
        this.refs.reviewDiff.height = 1;
        this.refs.reviewError.content = `Review unavailable\n\n${result.error}`;
      }
    }
    this.refs.reviewDiff.view =
      this.reviewView ??
      (this.options.renderer.width >= 150 ? "split" : "unified");
    this.refs.reviewDiff.wrapMode = this.reviewWrap ? "word" : "none";
    this.refs.reviewStatus.content = t`${fg(parterreTheme.warning)(`${review.bytes} bytes  ${this.reviewStats}`)}  ${this.reviewCanApprove ? fg(parterreTheme.success)("Y approve  ") : ""}${fg(parterreTheme.error)("N deny")}  ${fg(parterreTheme.faint)("↑↓/Pg scroll  [ ] hunk  v view  w wrap")}`;
  }

  private render(): void {
    if (this.exited) return;
    const review = this.state.workspaceReview;
    this.refs.startup.visible = this.showStartup && !review;
    this.refs.workspace.visible = !this.showStartup && !review;
    this.refs.review.visible = Boolean(review);
    if (review) {
      this.renderReview(review);
      this.suspendPainter();
      return;
    }
    if (this.renderedReviewId !== undefined) {
      this.renderedReviewId = undefined;
      this.refs.reviewDiff.diff = "";
      this.refs.reviewDiff.height = 1;
      this.refs.reviewError.content = "";
      this.reviewStats = "";
    }
    if (this.showStartup) {
      this.renderStartup();
      this.suspendPainter();
      return;
    }

    const activity = selectAgentActivity(
      this.state,
      this.options.config.provider
    );
    const layout = computeAppLayout({
      rows: this.options.renderer.height,
      columns: this.options.renderer.width,
      browserFocused: this.state.browserFocused,
      hasActivity: Boolean(activity),
      commandMatchCount: this.commandMatches.length,
      modelPickerCount: this.modelPicker?.models.length,
      pendingApproval: Boolean(this.state.pendingApproval),
      composerInput: this.state.input
    });
    this.refs.main.height = layout.mainHeight;
    this.refs.left.width = layout.leftWidth;
    this.refs.left.visible = !this.state.browserFocused;
    this.refs.browser.width = this.state.browserFocused
      ? this.options.renderer.width - 2
      : Math.max(1, layout.browserWidth - 2);
    this.refs.transcript.height = layout.transcriptHeight;
    this.refs.activity.visible = layout.activityHeight > 0;
    this.refs.activity.content = activity ? `◇ ${activity}` : "";
    this.refs.control.height = this.modelPicker
      ? Math.min(8, Math.max(this.modelPicker.models.length, 1)) + 3
      : this.state.pendingApproval
        ? 5
        : layout.composerHeight;
    this.renderTranscript();
    this.renderCommands(layout.showActionBar ? layout.actionBarHeight : 0);
    if (this.modelPicker) this.renderModelPicker();
    else if (this.state.pendingApproval) this.renderApproval();
    else this.renderComposer(layout.composerHeight, layout.compactComposer);
    this.renderBrowser();
    this.renderStatus();
    this.options.renderer.requestRender();
  }

  private get currentModel(): string {
    return this.state.currentModel ?? this.options.config.model;
  }

  private syncComposerInput(): void {
    if (this.composerSync) return;
    this.dispatch({type: "input", input: this.refs.composer.plainText});
  }

  private submitComposer(): void {
    this.submitInput(this.refs.composer.plainText);
  }

  private submitInput(input: string): void {
    createSendMessage({
      runtimeRef: {current: this.runtime},
      dispatch: action => this.dispatch(action),
      stopRuntime: () => this.stopRuntime(),
      exit: error => void this.stop(error),
      openModelPicker: activeModel => this.openModelPicker(activeModel),
      currentModel: this.currentModel,
      reportHostError: this.reportHostError,
      workspace: this.options.config.workspace
    })(input);
  }

  private openModelPicker(activeModel: string): void {
    this.modelPicker = {models: [], index: 0, loading: true};
    this.render();
    void (async () => {
      try {
        const models = (await this.runtime?.listModels()) ?? [];
        if (!this.modelPicker) return;
        this.modelPicker = {
          models,
          index: Math.max(
            0,
            models.findIndex(model => model.id === activeModel)
          ),
          loading: false
        };
        this.render();
      } catch (error) {
        this.modelPicker = undefined;
        this.reportHostError(error);
      }
    })();
  }

  private handleModelPickerInput(key: KeyEvent): boolean {
    const picker = this.modelPicker;
    if (!picker) return false;
    if (key.name === "escape") {
      this.modelPicker = undefined;
    } else if (key.name === "up") {
      picker.index = Math.max(0, picker.index - 1);
    } else if (key.name === "down") {
      picker.index = Math.min(
        Math.max(picker.models.length - 1, 0),
        picker.index + 1
      );
    } else if (
      (key.name === "return" || key.name === "linefeed") &&
      !picker.loading
    ) {
      const choice = picker.models[picker.index];
      this.modelPicker = undefined;
      if (choice && choice.id !== this.currentModel) {
        void this.runtime?.setModel(choice.id).catch(this.reportHostError);
      }
    }
    this.render();
    return true;
  }

  private handleKeyPress = (key: KeyEvent): void => {
    if (key.ctrl && key.name === "c") {
      key.preventDefault();
      void this.stop();
      return;
    }
    const review = this.state.workspaceReview;
    if (review) {
      key.preventDefault();
      if (
        key.name.toLowerCase() === "n" ||
        key.name === "escape" ||
        (key.name.toLowerCase() === "y" && this.reviewCanApprove)
      ) {
        const approved = key.name.toLowerCase() === "y";
        void this.runtime
          ?.resolveApproval(review.requestId, approved)
          .catch(this.reportHostError);
        this.dispatch({type: "clearApproval"});
      } else if (key.name === "up") {
        this.refs.reviewScroll.scrollBy(-1, "step");
      } else if (key.name === "down") {
        this.refs.reviewScroll.scrollBy(1, "step");
      } else if (key.name === "pageup") {
        this.refs.reviewScroll.scrollBy(-1, "viewport");
      } else if (key.name === "pagedown") {
        this.refs.reviewScroll.scrollBy(1, "viewport");
      } else if (key.name === "j") {
        this.refs.reviewScroll.scrollBy(1, "step");
      } else if (key.name === "k") {
        this.refs.reviewScroll.scrollBy(-1, "step");
      } else if (key.name === "h" || key.name === "left") {
        this.refs.reviewScroll.scrollBy({x: -1, y: 0}, "step");
      } else if (key.name === "l" || key.name === "right") {
        this.refs.reviewScroll.scrollBy({x: 1, y: 0}, "step");
      } else if (key.name === "home") {
        this.refs.reviewScroll.scrollTo(0);
      } else if (key.name === "end") {
        this.refs.reviewScroll.scrollTo(this.refs.reviewScroll.scrollHeight);
      } else if (key.name === "[" || key.name === "]") {
        const offsets = this.refs.reviewDiff.getHunkRowOffsets();
        if (offsets.length > 0) {
          this.reviewHunkIndex = Math.min(
            offsets.length - 1,
            Math.max(0, this.reviewHunkIndex + (key.name === "[" ? -1 : 1))
          );
          this.refs.reviewScroll.scrollTo(offsets[this.reviewHunkIndex] ?? 0);
        }
      } else if (key.name === "v") {
        this.reviewView =
          this.refs.reviewDiff.view === "unified" ? "split" : "unified";
        this.renderReview(review);
      } else if (key.name === "w") {
        this.reviewWrap = !this.reviewWrap;
        this.renderReview(review);
      }
      return;
    }
    if (key.ctrl && key.name === "b") {
      key.preventDefault();
      this.dispatch({type: "toggleBrowserFocus"});
      return;
    }
    if (key.name === "pageup" || key.name === "pagedown") {
      key.preventDefault();
      this.refs.transcript.scrollBy(key.name === "pageup" ? -1 : 1, "viewport");
      return;
    }
    if (key.name === "escape" && this.state.activeTurnIds.length > 0) {
      key.preventDefault();
      void this.runtime?.interrupt().catch(this.reportHostError);
      return;
    }
    if (this.handleModelPickerInput(key)) {
      key.preventDefault();
      return;
    }
    const approval = this.state.pendingApproval;
    if (
      approval &&
      (key.name.toLowerCase() === "y" || key.name.toLowerCase() === "n")
    ) {
      key.preventDefault();
      const approved = key.name.toLowerCase() === "y";
      void this.runtime
        ?.resolveApproval(approval.request.id, approved)
        .catch(this.reportHostError);
      this.dispatch({type: "clearApproval"});
      return;
    }
    if (
      this.composerCompact &&
      !this.modelPicker &&
      this.state.status === "running"
    ) {
      if (key.name === "return" || key.name === "linefeed") {
        key.preventDefault();
        this.submitInput(this.state.input);
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        key.preventDefault();
        this.dispatch({
          type: "input",
          input: Array.from(this.state.input).slice(0, -1).join("")
        });
        return;
      }
      if (
        !key.ctrl &&
        !key.meta &&
        !key.super &&
        key.sequence &&
        !key.sequence.startsWith("\u001b")
      ) {
        key.preventDefault();
        this.dispatch({type: "input", input: this.state.input + key.sequence});
      }
    }
  };

  private handlePaste = (event: PasteEvent): void => {
    if (
      !this.composerCompact ||
      this.modelPicker ||
      this.state.pendingApproval ||
      this.state.workspaceReview ||
      this.state.status !== "running"
    ) {
      return;
    }
    event.preventDefault();
    this.dispatch({
      type: "input",
      input: this.state.input + Buffer.from(event.bytes).toString("utf8")
    });
  };

  private handleResize = (): void => {
    this.lastPainterRegion = "";
    this.render();
  };

  private handleRendererFrame = (): void => {
    if (!this.refs.workspace.visible || !this.refs.browser.visible) {
      this.suspendPainter();
      return;
    }
    const region = {
      col: this.refs.browserContent.screenX,
      row: this.refs.browserContent.screenY,
      width: this.refs.browserContent.width,
      height: this.refs.browserContent.height,
      appHeight: this.options.renderer.height
    };
    const key = JSON.stringify(region);
    if (key === this.lastPainterRegion) {
      this.painter?.repaint();
      return;
    }
    this.lastPainterRegion = key;
    this.painter?.setRegion(region);
    if (this.painterSuspended) {
      this.painterSuspended = false;
      this.painter?.resume();
    }
    this.painter?.repaint();
  };

  private suspendPainter(): void {
    if (!this.painter || !this.lastPainterRegion) return;
    this.lastPainterRegion = "";
    this.painterSuspended = true;
    this.painter.suspend();
  }

  private async stopRuntime(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    this.stopPromise = (async () => {
      let runtime = this.runtime;
      if (!runtime && this.runtimePromise) {
        try {
          runtime = await this.runtimePromise;
        } catch {
          return;
        }
      }
      await runtime?.stop();
    })();
    return this.stopPromise;
  }

  async stop(error?: Error): Promise<void> {
    if (this.exited) return;
    this.exited = true;
    this.exitError = error;
    if (this.startupTimer) clearInterval(this.startupTimer);
    this.startupTimer = undefined;
    this.options.renderer.keyInput.off("keypress", this.handleKeyPress);
    this.options.renderer.keyInput.off("paste", this.handlePaste);
    this.options.renderer.off(CliRenderEvents.RESIZE, this.handleResize);
    this.options.renderer.off(CliRenderEvents.FRAME, this.handleRendererFrame);
    try {
      await this.stopRuntime();
    } finally {
      this.painter?.stop();
      this.options.renderer.destroy();
      this.resolveExit?.();
    }
  }

  async waitUntilExit(): Promise<void> {
    await this.exitPromise;
    if (this.exitError) throw this.exitError;
  }
}

export function createParterreTui(options: ParterreTuiOptions): ParterreTui {
  return new ParterreTuiApp(options);
}
