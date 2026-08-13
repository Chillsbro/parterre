import {expect, test} from "bun:test";
import {mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  createFramePainter,
  type FrameRegion,
  readPngDimensions
} from "../../../src/terminal/index.js";

const esc = String.fromCharCode(27);

function makePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

async function writeFrame(
  dir: string,
  name: string,
  bytes: Uint8Array
): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}

function createHarness(positioning: "relative" | "absolute" = "relative") {
  const writes: string[] = [];
  const painter = createFramePainter({
    cellWidth: 10,
    cellHeight: 20,
    stdout: {write: (data: string) => writes.push(data), rows: 40},
    positioning
  });
  return {painter, writes};
}

const region: FrameRegion = {
  col: 42,
  row: 1,
  width: 56,
  height: 20,
  appHeight: 40
};

async function idle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 10));
}

test("reads png dimensions from the header", () => {
  expect(readPngDimensions(makePng(1280, 800))).toEqual({
    width: 1280,
    height: 800
  });
  expect(() => readPngDimensions(new Uint8Array([1, 2, 3]))).toThrow(
    "Not a PNG file"
  );
});

test("transmits a Kitty frame and places a contain-fitted box", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness();
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  expect(writes).toHaveLength(1);
  const output = writes[0]!;
  expect(output).toContain("_Gf=100,t=d,i=4041");
  expect(output).toContain("_Ga=p,i=4041,p=1,c=56,r=18,C=1,q=2");
  expect(output).toContain(`${esc}[37A`);
  expect(output).toContain(`${esc}[42C`);
});

test("alternates Kitty image ids and deletes the prior frame", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness();
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  painter.submitFrame(await writeFrame(dir, "f2.png", makePng(1280, 800)));
  await idle();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toContain("i=4042");
  expect(writes[1]).toContain("_Ga=d,d=I,i=4041,q=2");
});

test("coalesces to the latest frame while a paint is in flight", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness();
  const first = await writeFrame(dir, "f1.png", makePng(1280, 800));
  const second = await writeFrame(dir, "f2.png", makePng(640, 400));
  const third = await writeFrame(dir, "f3.png", makePng(320, 200));
  painter.setRegion(region);
  painter.submitFrame(first);
  painter.submitFrame(second);
  painter.submitFrame(third);
  await idle();
  expect(writes.length).toBeLessThanOrEqual(2);
  expect(writes.at(-1)).toContain("i=4042");
});

test("holds the newest frame until a region is known", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness();
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  expect(writes).toHaveLength(0);
  painter.setRegion(region);
  await idle();
  expect(writes).toHaveLength(1);
});

test("repaint re-places without retransmitting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness();
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  painter.repaint();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toContain("_Ga=p,i=4041");
  expect(writes[1]).not.toContain("_Gf=100");
});

test("stop deletes the active Kitty image", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness();
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  painter.stop();
  expect(writes.at(-1)).toBe(`${esc}_Ga=d,d=I,i=4041,q=2${esc}\\`);
  painter.submitFrame(join(dir, "f1.png"));
  await idle();
  expect(writes).toHaveLength(2);
});

test("absolute positioning is independent of the TUI cursor", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness("absolute");
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  expect(writes[0]).toContain(`${esc}[3;43H`);
  expect(writes[0]).not.toContain(`${esc}[37A`);
});

test("suspend and resume paint only the newest queued frame", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness("absolute");
  const first = await writeFrame(dir, "f1.png", makePng(1280, 800));
  const second = await writeFrame(dir, "f2.png", makePng(640, 400));
  const newestBytes = makePng(320, 200);
  const newest = await writeFrame(dir, "f3.png", newestBytes);
  painter.setRegion(region);
  painter.submitFrame(first);
  await idle();

  painter.suspend();
  expect(writes[1]).toBe(`${esc}_Ga=d,d=i,i=4041,p=1,q=2${esc}\\`);
  expect(writes[2]).toContain(`${esc}[2;43H${" ".repeat(region.width)}`);
  painter.submitFrame(second);
  painter.submitFrame(newest);
  await idle();
  expect(writes).toHaveLength(3);

  painter.resume();
  await idle();
  expect(writes).toHaveLength(4);
  expect(writes[3]).toContain(Buffer.from(newestBytes).toString("base64"));
  expect(writes[3]).toContain("i=4042");
});
