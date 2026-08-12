import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {Box, renderToString, Text} from "ink";
import {InkPictureProvider, type TerminalInfo} from "ink-picture";
import type {ReactElement} from "react";
import {
  ActionBar,
  BrowserSurface,
  CurtainReveal,
  StatusBar,
  Transcript
} from "../src/components/index.js";
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

function ansiToRows(output: string): Segment[][] {
  return output.split("\n").map(line => {
    const segments: Segment[] = [];
    let color: string = parterreTheme.text;
    let bold = false;
    let text = "";
    const flush = (): void => {
      if (text) segments.push({text, color, bold});
      text = "";
    };
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== "\x1b") {
        text += line[index];
        continue;
      }
      const match = /^\x1b\[([0-9;]*)m/.exec(line.slice(index));
      if (!match) continue;
      flush();
      const codes = (match[1] ?? "").split(";").map(Number);
      for (let c = 0; c < codes.length; c += 1) {
        const code = codes[c];
        if (code === 0) {
          color = parterreTheme.text;
          bold = false;
        } else if (code === 1) bold = true;
        else if (code === 22) bold = false;
        else if (code === 39) color = parterreTheme.text;
        else if (code === 38 && codes[c + 1] === 2) {
          const [r, g, b] = [
            codes[c + 2] ?? 0,
            codes[c + 3] ?? 0,
            codes[c + 4] ?? 0
          ];
          color = `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
          c += 4;
        }
      }
      index += match[0].length - 1;
    }
    flush();
    return segments;
  });
}

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

const assetsDir = join(import.meta.dir, "..", "assets");
await mkdir(assetsDir, {recursive: true});

const curtainSteps = Array.from({length: 22}, (_, index) => index / 21);
const curtainFrames = curtainSteps.map(progress =>
  ansiToRows(renderToString(<CurtainReveal width={76} progress={progress} />))
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

const capableTerminal: TerminalInfo = {
  cellWidth: 10,
  cellHeight: 20,
  terminalWidth: 800,
  terminalHeight: 480,
  supportsSixelGraphics: false,
  supportsKittyGraphics: true,
  supportsITerm2Graphics: false,
  supportsUnicode: true,
  supportsColor: true
};

interface TimelineItem {
  id: string;
  kind: "user" | "agent" | "tool" | "error";
  content: string;
  detail?: string;
  ok?: boolean;
}

function FauxComposer(props: {typed: string}): ReactElement {
  return (
    <Box
      borderStyle="round"
      borderColor={
        props.typed ? parterreTheme.accentMuted : parterreTheme.borderSoft
      }
      paddingX={1}
    >
      <Text color={parterreTheme.accent}>❯ </Text>
      {props.typed ? (
        <Text color={parterreTheme.text}>
          {props.typed}
          <Text color={parterreTheme.accent}>▌</Text>
        </Text>
      ) : (
        <Text color={parterreTheme.faint}>Describe a task, or /</Text>
      )}
    </Box>
  );
}

function renderWorkspaceFrame(frame: {
  items: TimelineItem[];
  typed: string;
  pageUrl: string | undefined;
  pageTitle: string | undefined;
  statusUrl: string | undefined;
}): Segment[][] {
  return ansiToRows(
    renderToString(
      <InkPictureProvider terminalInfo={capableTerminal}>
        <Box flexDirection="column" width={80} height={24}>
          <Box height={22}>
            <Box flexDirection="column" width={34} paddingLeft={1}>
              <Transcript items={frame.items} height={19} />
              <FauxComposer typed={frame.typed} />
            </Box>
            <BrowserSurface
              screenshotPath={undefined}
              pageUrl={frame.pageUrl}
              pageTitle={frame.pageTitle}
              width={46}
              height={22}
            />
          </Box>
          <StatusBar
            browserOpen={Boolean(frame.pageUrl)}
            browserFocused={false}
            status="running"
            pageUrl={frame.statusUrl}
            model="gpt-5"
            agentActive={false}
          />
        </Box>
      </InkPictureProvider>
    )
  );
}

const paneInterior = {
  x: padding + 36 * cellWidth,
  y: padding + chromeHeight + 1 * lineHeight,
  width: 42 * cellWidth,
  height: 20 * lineHeight
};

async function pageShotDef(id: string, filename: string): Promise<string> {
  const image = await readFile(join(assetsDir, filename));
  return `<g id="${id}"><rect x="${paneInterior.x}" y="${paneInterior.y}" width="${paneInterior.width}" height="${paneInterior.height}" fill="${parterreTheme.background}"/><image x="${paneInterior.x + 4}" y="${paneInterior.y + 4}" width="${paneInterior.width - 8}" height="${paneInterior.height - 8}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${image.toString("base64")}"/></g>`;
}

const shotDefs = [
  await pageShotDef("shot-home", "browser-shot.png"),
  await pageShotDef("shot-docs", "browser-shot-docs.png"),
  await pageShotDef("shot-assertions", "browser-shot-assertions.png")
].join("");

const openItems: TimelineItem[] = [
  {id: "1", kind: "user", content: "Open the Playwright docs"},
  {id: "2", kind: "tool", content: "goto", detail: "412ms", ok: true},
  {id: "3", kind: "agent", content: "The Playwright homepage is open."}
];
const clickItems: TimelineItem[] = [
  ...openItems,
  {id: "4", kind: "user", content: "Click Get started"},
  {id: "5", kind: "tool", content: "click", detail: "96ms", ok: true},
  {id: "6", kind: "tool", content: "goto", detail: "305ms", ok: true},
  {id: "7", kind: "agent", content: "Installation docs are open."}
];
const testItems: TimelineItem[] = [
  ...clickItems,
  {id: "8", kind: "user", content: "/test the assertions guide loads"},
  {id: "9", kind: "tool", content: "goto", detail: "288ms", ok: true},
  {id: "10", kind: "tool", content: "find", detail: "61ms", ok: true},
  {
    id: "11",
    kind: "agent",
    content: "Assertions guide verified. All checks passed."
  }
];

const home = {
  pageUrl: "https://playwright.dev",
  pageTitle: "Playwright",
  statusUrl: "playwright.dev"
};
const docs = {
  pageUrl: "https://playwright.dev/docs/intro",
  pageTitle: "Installation",
  statusUrl: "playwright.dev/docs/intro"
};
const assertions = {
  pageUrl: "https://playwright.dev/docs/test-assertions",
  pageTitle: "Assertions",
  statusUrl: "playwright.dev/docs/test-assertions"
};
const emptyStage = {
  pageUrl: undefined,
  pageTitle: undefined,
  statusUrl: undefined
};

const workspaceStory: Array<{
  frame: Parameters<typeof renderWorkspaceFrame>[0];
  shot: string | undefined;
  seconds: number;
}> = [
  {
    frame: {items: [], typed: "Open the Playwright docs", ...emptyStage},
    shot: undefined,
    seconds: 2
  },
  {
    frame: {items: openItems, typed: "", ...home},
    shot: "shot-home",
    seconds: 2.8
  },
  {
    frame: {items: openItems, typed: "Click Get started", ...home},
    shot: "shot-home",
    seconds: 2
  },
  {
    frame: {items: clickItems, typed: "", ...docs},
    shot: "shot-docs",
    seconds: 2.8
  },
  {
    frame: {
      items: clickItems,
      typed: "/test the assertions guide loads",
      ...docs
    },
    shot: "shot-docs",
    seconds: 2
  },
  {
    frame: {items: testItems, typed: "", ...assertions},
    shot: "shot-assertions",
    seconds: 4
  }
];

const workspaceFrames = workspaceStory.map(step =>
  renderWorkspaceFrame(step.frame)
);
const workspaceRowCount = Math.max(
  ...workspaceFrames.map(frame => frame.length)
);
await writeFile(
  join(assetsDir, "workspace.svg"),
  terminalSvg({
    frames: workspaceFrames.map(frame => pad(frame, workspaceRowCount)),
    columns: 80,
    rows: workspaceRowCount,
    frameDurations: workspaceStory.map(step => step.seconds),
    frameOverlays: workspaceStory.map(step =>
      step.shot ? `<use href="#${step.shot}"/>` : undefined
    ),
    defsSvg: shotDefs
  })
);

const commandInputs = ["/", "/t", "/te", "/test", "/l", "/le", "/learn"];
const commandFrames = commandInputs.map(input =>
  ansiToRows(
    renderToString(
      <Box flexDirection="column" width={44}>
        <ActionBar input={input} />
        <Box
          borderStyle="round"
          borderColor={parterreTheme.accentMuted}
          paddingX={1}
        >
          <Text color={parterreTheme.accent}>❯ </Text>
          <Text color={parterreTheme.text}>{input}</Text>
        </Box>
      </Box>
    )
  )
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
