import {expect, test} from "bun:test";
import {EventEmitter} from "node:events";
import {render, renderToString} from "ink";
import {createRef} from "react";
import {
  Transcript,
  type TranscriptScrollHandle
} from "../../../src/components/index.js";
import type {SessionEvent} from "../../../src/sessions/index.js";
import {
  buildTimelineItems,
  type TimelineItem
} from "../../../src/transcript/index.js";

class FakeStdout extends EventEmitter {
  columns = 44;
  rows = 24;
  frames: string[] = [];
  write(chunk: string): boolean {
    this.frames.push(chunk);
    return true;
  }
}

class FakeStdin extends EventEmitter {
  isTTY = true;
  setRawMode(): this {
    return this;
  }
  setEncoding(): this {
    return this;
  }
  read(): null {
    return null;
  }
  resume(): this {
    return this;
  }
  pause(): this {
    return this;
  }
  ref(): this {
    return this;
  }
  unref(): this {
    return this;
  }
}

test("keeps the transcript inside its panel when history overflows", async () => {
  const items: TimelineItem[] = Array.from({length: 20}, (_, index) => ({
    id: `tool-${index}`,
    kind: "tool" as const,
    content: `step-${String(index + 1).padStart(2, "0")}`,
    ok: true
  }));
  items.push({
    id: "reply",
    kind: "agent",
    content:
      "The final agent reply is long enough to wrap across several rows of the transcript panel and must stay visible at the bottom."
  });
  const stdout = new FakeStdout();
  const instance = render(<Transcript items={items} height={12} />, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  const frame = Bun.stripANSI(stdout.frames.at(-1) ?? "");
  instance.unmount();
  const lines = frame.split("\n");
  expect(lines.length).toBeLessThanOrEqual(12);
  expect(frame).toContain("at the bottom.");
  expect(frame).not.toContain("step-01");
});

test("holds the scroll position while new messages stream in", async () => {
  const items: TimelineItem[] = Array.from({length: 20}, (_, index) => ({
    id: `tool-${index}`,
    kind: "tool" as const,
    content: `step-${String(index + 1).padStart(2, "0")}`,
    ok: true
  }));
  const scrollRef = createRef<TranscriptScrollHandle>();
  const stdout = new FakeStdout();
  const instance = render(
    <Transcript items={items} height={12} scrollRef={scrollRef} />,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false
    }
  );
  await new Promise(resolve => setTimeout(resolve, 100));
  scrollRef.current?.pageUp();
  scrollRef.current?.pageUp();
  await new Promise(resolve => setTimeout(resolve, 100));
  instance.rerender(
    <Transcript
      items={[
        ...items,
        {id: "late", kind: "agent", content: "A brand new streamed reply."}
      ]}
      height={12}
      scrollRef={scrollRef}
    />
  );
  await new Promise(resolve => setTimeout(resolve, 100));
  const held = Bun.stripANSI(stdout.frames.at(-1) ?? "");
  expect(held).toContain("step-01");
  expect(held).not.toContain("brand new streamed reply");
  scrollRef.current?.pageDown();
  scrollRef.current?.pageDown();
  await new Promise(resolve => setTimeout(resolve, 100));
  const followed = Bun.stripANSI(stdout.frames.at(-1) ?? "");
  instance.unmount();
  expect(followed).toContain("brand new streamed reply");
  expect(followed).not.toContain("step-01");
});

test("scrolls by lines and re-pins at the bottom", async () => {
  const items: TimelineItem[] = Array.from({length: 20}, (_, index) => ({
    id: `tool-${index}`,
    kind: "tool" as const,
    content: `step-${String(index + 1).padStart(2, "0")}`,
    ok: true
  }));
  const scrollRef = createRef<TranscriptScrollHandle>();
  const stdout = new FakeStdout();
  const instance = render(
    <Transcript items={items} height={12} scrollRef={scrollRef} />,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false
    }
  );
  await new Promise(resolve => setTimeout(resolve, 100));
  for (let step = 0; step < 6; step += 1) scrollRef.current?.scrollLines(-2);
  await new Promise(resolve => setTimeout(resolve, 100));
  const scrolled = Bun.stripANSI(stdout.frames.at(-1) ?? "");
  expect(scrolled).toContain("step-01");
  expect(scrolled).not.toContain("step-20");
  for (let step = 0; step < 6; step += 1) scrollRef.current?.scrollLines(2);
  await new Promise(resolve => setTimeout(resolve, 100));
  const returned = Bun.stripANSI(stdout.frames.at(-1) ?? "");
  instance.unmount();
  expect(returned).toContain("step-20");
  expect(returned).not.toContain("step-01");
});

test("keeps a bounded 300-search transcript scrollable", async () => {
  const events: SessionEvent[] = Array.from({length: 300}, (_, index) => [
    {
      type: "agent_message" as const,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + index * 1000).toISOString(),
      message: {
        type: "assistant_message" as const,
        id: `narration-${index}`,
        content: `Checking search result ${index + 1} before continuing.`
      }
    },
    {
      type: "playwright_finished" as const,
      timestamp: `2026-01-01T00:00:${index}.001Z`,
      result: {
        request: {id: `search-${index}`, command: "find", args: []},
        ok: true,
        output: "",
        artifacts: [],
        durationMs: index + 1
      }
    }
  ]).flat();
  const items = buildTimelineItems(events);
  const scrollRef = createRef<TranscriptScrollHandle>();
  const stdout = new FakeStdout();
  const instance = render(
    <Transcript items={items} height={12} scrollRef={scrollRef} />,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false
    }
  );
  await new Promise(resolve => setTimeout(resolve, 100));
  scrollRef.current?.scrollLines(-10_000);
  await new Promise(resolve => setTimeout(resolve, 100));
  const oldestVisible = Bun.stripANSI(stdout.frames.at(-1) ?? "");
  scrollRef.current?.scrollLines(10_000);
  await new Promise(resolve => setTimeout(resolve, 100));
  const newestVisible = Bun.stripANSI(stdout.frames.at(-1) ?? "");
  instance.unmount();

  expect(oldestVisible).toContain("401 earlier transcript entries");
  expect(oldestVisible).not.toContain("Checking search result 1 ");
  expect(newestVisible).toContain("Checking search result 300");
});

test("renders short transcripts without hiding anything", () => {
  const items: TimelineItem[] = [
    {id: "ask", kind: "user", content: "Open the Playwright docs"},
    {id: "act", kind: "tool", content: "goto", detail: "412ms", ok: true},
    {id: "reply", kind: "agent", content: "The Playwright homepage is open."}
  ];
  const output = renderToString(<Transcript items={items} height={19} />);
  expect(output).toContain("Open the Playwright docs");
  expect(output).toContain("goto  412ms");
  expect(output).toContain("The Playwright homepage is open.");
  expect(output).not.toContain("hidden");
});

test("renders video filesystem links as terminal hyperlinks", () => {
  const output = renderToString(
    <Transcript
      items={[
        {
          id: "video",
          kind: "tool",
          content: "Video recorded — view ",
          link: {
            label: "here",
            href: "file:///tmp/recording.webm"
          },
          ok: true
        }
      ]}
      height={12}
    />,
    {columns: 44}
  );
  expect(output).toContain("Video recorded — view ");
  expect(output).toContain("\u001B]8;;file:///tmp/recording.webm\u0007here");
});

test("compacts unusually spaced user content after submission", () => {
  const content = `const value = 1;\n\n${" ".repeat(80)}return value;`;
  const output = renderToString(
    <Transcript items={[{id: "paste", kind: "user", content}]} height={12} />,
    {columns: 44}
  );
  expect(output).toContain(`Large input · 3 lines · ${content.length} chars`);
  expect(output).not.toContain("return value");
  expect(Bun.stripANSI(output).split("\n")).toHaveLength(12);
});
