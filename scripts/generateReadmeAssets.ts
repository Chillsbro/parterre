import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {TextAttributes} from "@opentui/core";
import {createTestRenderer} from "@opentui/core/testing";
import {createCurtainRows} from "../src/app/branding/index.js";
import {createParterreTui} from "../src/app/index.js";
import {matchSlashCommands} from "../src/commands/index.js";
import type {AppConfig} from "../src/config/index.js";
import type {
  createSessionRuntime,
  RuntimeController,
  RuntimeNotification
} from "../src/runtime/index.js";
import type {SessionEvent} from "../src/sessions/index.js";
import {parterreTheme} from "../src/theme/index.js";

interface Segment {
  text: string;
  color: string;
  bold: boolean;
}

const cellWidth = 9.6;
const lineHeight = 19;
const padding = 24;
const chromeHeight = 36;
const assetsDir = join(import.meta.dir, "..", "assets");

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function frameMarkup(rows: Segment[][]): string {
  return rows
    .map((segments, row) => {
      const content = segments
        .map(
          segment =>
            `<tspan fill="${segment.color}"${segment.bold ? ' font-weight="700"' : ""}>${escapeXml(segment.text)}</tspan>`
        )
        .join("");
      const width = segments.reduce(
        (total, segment) => total + segment.text.length,
        0
      );
      return `<text x="${padding}" y="${padding + chromeHeight + row * lineHeight + 15}" textLength="${(width * cellWidth).toFixed(1)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${content}</text>`;
    })
    .join("\n");
}

function terminalSvg(options: {
  frames: Segment[][][];
  columns: number;
  rows: number;
  frameSeconds?: number;
  holdSeconds?: number;
  frameDurations?: number[];
  frameOverlays?: Array<string | undefined>;
  defsSvg?: string;
}): string {
  const {frames, columns, rows} = options;
  const width = Math.round(columns * cellWidth + padding * 2);
  const height = Math.round(rows * lineHeight + padding * 2 + chromeHeight);
  const chrome = `
  <circle cx="${padding + 6}" cy="${padding + 6}" r="6" fill="#FF5F57"/>
  <circle cx="${padding + 28}" cy="${padding + 6}" r="6" fill="#FEBC2E"/>
  <circle cx="${padding + 50}" cy="${padding + 6}" r="6" fill="#28C840"/>`;
  let body: string;
  if (frames.length === 1) {
    body = `<g>${frameMarkup(frames[0] ?? [])}${options.frameOverlays?.[0] ?? ""}</g>`;
  } else {
    const frameSeconds = options.frameSeconds ?? 0.22;
    const holdSeconds = options.holdSeconds ?? 2.4;
    const durations = frames.map(
      (_, index) =>
        options.frameDurations?.[index] ??
        (index === frames.length - 1 ? holdSeconds : frameSeconds)
    );
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    let elapsed = 0;
    body = frames
      .map((rows, index) => {
        const start = elapsed / total;
        elapsed += durations[index] ?? 0;
        const end = index === frames.length - 1 ? 1 : elapsed / total;
        const overlay = options.frameOverlays?.[index] ?? "";
        return `<g opacity="0"><animate attributeName="opacity" dur="${total.toFixed(2)}s" repeatCount="indefinite" calcMode="discrete" keyTimes="0;${start.toFixed(4)};${end.toFixed(4)}" values="0;1;${index === frames.length - 1 ? 1 : 0}"/>${frameMarkup(rows)}${overlay}</g>`;
      })
      .join("\n");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, 'SF Mono', Menlo, Consolas, monospace" font-size="16">
<rect width="${width}" height="${height}" rx="14" fill="${parterreTheme.background}"/>
${chrome}
${options.defsSvg ? `<defs>${options.defsSvg}</defs>` : ""}
${body}
</svg>
`;
}

function pad(rows: Segment[][], rowCount: number): Segment[][] {
  const padded = [...rows];
  while (padded.length < rowCount) padded.push([]);
  return padded;
}

function colorHex(color: {toInts(): [number, number, number, number]}): string {
  const [red, green, blue] = color.toInts();
  return `#${[red, green, blue]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function fakeRuntime(): {
  createRuntime: typeof createSessionRuntime;
  emit(notification: RuntimeNotification): void;
} {
  let notify: ((notification: RuntimeNotification) => void) | undefined;
  const controller: RuntimeController = {
    async sendUserMessage() {},
    async interrupt() {
      return false;
    },
    async resolveApproval() {},
    async listModels() {
      return [];
    },
    async setModel() {},
    async clearTranscript() {},
    authorizeCodebaseRoot: path => resolve(path),
    async clearCodebaseProfile() {},
    async isWorkspaceProfileStale() {
      return false;
    },
    async stop() {}
  };
  return {
    createRuntime: async options => {
      notify = options.onNotification;
      notify({type: "status", status: "running"});
      return controller;
    },
    emit: notification => notify?.(notification)
  };
}

const previewConfig: AppConfig = {
  provider: "copilot",
  workspace: resolve("."),
  model: "gpt-5",
  storageDir: "/tmp/parterre-readme-preview",
  playwrightCommand: "playwright-cli",
  redactions: []
};

async function renderWorkspaceFrame(options: {
  events: SessionEvent[];
  typed: string;
  liveFrame: boolean;
}): Promise<Segment[][]> {
  const setup = await createTestRenderer({width: 80, height: 24});
  const runtime = fakeRuntime();
  const app = createParterreTui({
    config: previewConfig,
    graphics: {
      cellWidth: 10,
      cellHeight: 20,
      terminalWidth: 800,
      terminalHeight: 480,
      supportsKittyGraphics: true
    },
    renderer: setup.renderer,
    createRuntime: runtime.createRuntime,
    createPainter: () => ({
      submitFrame() {},
      setRegion() {},
      suspend() {},
      resume() {},
      repaint() {},
      stop() {}
    }),
    skipStartup: true
  });
  for (const event of options.events) {
    runtime.emit({type: "event", event});
  }
  if (options.liveFrame) {
    runtime.emit({type: "liveFrame", path: "/preview/browser.png"});
  }
  if (options.typed) await setup.mockInput.typeText(options.typed);
  await setup.renderOnce();
  const capture = setup.captureSpans();
  const rows = capture.lines.map(line =>
    line.spans.map(span => ({
      text: span.text,
      color: colorHex(span.fg),
      bold: (span.attributes & TextAttributes.BOLD) !== 0
    }))
  );
  await app.stop();
  return rows;
}

function timestamp(index: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function user(id: string, content: string, index: number): SessionEvent {
  return {type: "user_message", timestamp: timestamp(index), id, content};
}

function assistant(id: string, content: string, index: number): SessionEvent {
  return {
    type: "agent_message",
    timestamp: timestamp(index),
    message: {type: "assistant_message", id, content}
  };
}

function browserStep(options: {
  id: string;
  command: string;
  durationMs: number;
  index: number;
  url?: string;
  title?: string;
}): SessionEvent {
  return {
    type: "playwright_finished",
    timestamp: timestamp(options.index),
    result: {
      request: {id: options.id, command: options.command, args: []},
      ok: true,
      output: "",
      artifacts: [],
      durationMs: options.durationMs,
      ...(options.url ? {url: options.url} : {}),
      ...(options.title ? {title: options.title} : {})
    }
  };
}

await mkdir(assetsDir, {recursive: true});

const curtainFrames = Array.from({length: 22}, (_, index) =>
  createCurtainRows(76, index / 21).map(row =>
    row.map(segment => ({...segment, bold: true}))
  )
);
const curtainRows = Math.max(...curtainFrames.map(frame => frame.length));
await writeFile(
  join(assetsDir, "curtain-reveal.svg"),
  terminalSvg({
    frames: curtainFrames.map(frame => pad(frame, curtainRows)),
    columns: 76,
    rows: curtainRows,
    frameSeconds: 0.16,
    holdSeconds: 3
  })
);

const openEvents = [
  user("1", "Open the Playwright docs", 1),
  browserStep({
    id: "2",
    command: "goto",
    durationMs: 412,
    index: 2,
    url: "https://playwright.dev",
    title: "Playwright"
  }),
  assistant("3", "The Playwright homepage is open.", 3)
];
const clickEvents = [
  ...openEvents,
  user("4", "Click Get started", 4),
  browserStep({id: "5", command: "click", durationMs: 96, index: 5}),
  browserStep({
    id: "6",
    command: "goto",
    durationMs: 305,
    index: 6,
    url: "https://playwright.dev/docs/intro",
    title: "Installation"
  }),
  assistant("7", "Installation docs are open.", 7)
];
const testEvents = [
  ...clickEvents,
  user("8", "/test the assertions guide loads", 8),
  browserStep({
    id: "9",
    command: "goto",
    durationMs: 288,
    index: 9,
    url: "https://playwright.dev/docs/test-assertions",
    title: "Assertions"
  }),
  browserStep({id: "10", command: "find", durationMs: 61, index: 10}),
  assistant("11", "Assertions guide verified. All checks passed.", 11)
];

const workspaceStory = [
  {events: [], typed: "Open the Playwright docs", shot: undefined, seconds: 2},
  {events: openEvents, typed: "", shot: "shot-home", seconds: 2.8},
  {
    events: openEvents,
    typed: "Click Get started",
    shot: "shot-home",
    seconds: 2
  },
  {events: clickEvents, typed: "", shot: "shot-docs", seconds: 2.8},
  {
    events: clickEvents,
    typed: "/test the assertions guide loads",
    shot: "shot-docs",
    seconds: 2
  },
  {
    events: testEvents,
    typed: "",
    shot: "shot-assertions",
    seconds: 4
  }
];
const workspaceFrames = await Promise.all(
  workspaceStory.map(step =>
    renderWorkspaceFrame({
      events: step.events,
      typed: step.typed,
      liveFrame: Boolean(step.shot)
    })
  )
);
const paneInterior = {
  x: padding + 34 * cellWidth,
  y: padding + chromeHeight + lineHeight,
  width: 44 * cellWidth,
  height: 20 * lineHeight
};
async function pageShotDef(id: string, filename: string): Promise<string> {
  const image = await readFile(join(assetsDir, filename));
  return `<g id="${id}"><rect x="${paneInterior.x}" y="${paneInterior.y}" width="${paneInterior.width}" height="${paneInterior.height}" fill="${parterreTheme.background}"/><image x="${paneInterior.x + 4}" y="${paneInterior.y + 4}" width="${paneInterior.width - 8}" height="${paneInterior.height - 8}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${image.toString("base64")}"/></g>`;
}
const shotDefs = (
  await Promise.all([
    pageShotDef("shot-home", "browser-shot.png"),
    pageShotDef("shot-docs", "browser-shot-docs.png"),
    pageShotDef("shot-assertions", "browser-shot-assertions.png")
  ])
).join("");
await writeFile(
  join(assetsDir, "workspace.svg"),
  terminalSvg({
    frames: workspaceFrames,
    columns: 80,
    rows: 24,
    frameDurations: workspaceStory.map(step => step.seconds),
    frameOverlays: workspaceStory.map(step =>
      step.shot ? `<use href="#${step.shot}"/>` : undefined
    ),
    defsSvg: shotDefs
  })
);

function commandFrame(input: string): Segment[][] {
  const width = 44;
  const matches = matchSlashCommands(input);
  const rows: Segment[][] = matches.map(command => [
    {text: command.command, color: parterreTheme.accent, bold: true},
    {text: ` ${command.label} `, color: parterreTheme.muted, bold: false},
    {text: `→ ${command.result}`, color: parterreTheme.faint, bold: false}
  ]);
  rows.push([
    {
      text: `╭${"─".repeat(width - 2)}╮`,
      color: parterreTheme.accentMuted,
      bold: false
    }
  ]);
  const prompt = `❯ ${input}`;
  rows.push([
    {text: "│ ", color: parterreTheme.accentMuted, bold: false},
    {text: "❯ ", color: parterreTheme.accent, bold: false},
    {text: input, color: parterreTheme.text, bold: false},
    {
      text: `${" ".repeat(Math.max(0, width - prompt.length - 3))}│`,
      color: parterreTheme.accentMuted,
      bold: false
    }
  ]);
  rows.push([
    {
      text: `╰${"─".repeat(width - 2)}╯`,
      color: parterreTheme.accentMuted,
      bold: false
    }
  ]);
  return rows;
}
const commandFrames = ["/", "/t", "/te", "/test", "/l", "/le", "/learn"].map(
  commandFrame
);
const commandRows = Math.max(...commandFrames.map(frame => frame.length));
await writeFile(
  join(assetsDir, "command-menu.svg"),
  terminalSvg({
    frames: commandFrames.map(frame => pad(frame, commandRows)),
    columns: 44,
    rows: commandRows,
    frameSeconds: 0.85,
    holdSeconds: 2
  })
);

console.log(
  "Wrote assets/curtain-reveal.svg, assets/workspace.svg, assets/command-menu.svg"
);
