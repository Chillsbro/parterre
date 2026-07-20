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

function createHarness(protocol: "kitty" | "iterm2") {
  const writes: string[] = [];
  let firstFrames = 0;
  const painter = createFramePainter({
    protocol,
    cellWidth: 10,
    cellHeight: 20,
    stdout: {write: (data: string) => writes.push(data), rows: 40},
    onFirstFrame: () => {
      firstFrames += 1;
    }
  });
  return {painter, writes, firstFrames: () => firstFrames};
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

test("kitty: transmits the frame and places a contain-fitted box", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes, firstFrames} = createHarness("kitty");
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  expect(writes).toHaveLength(1);
  const output = writes[0]!;
  expect(output).toContain("_Gf=100,t=d,i=4041");
  expect(output).toContain("_Ga=p,i=4041,p=1,c=56,r=18,C=1,q=2");
  expect(output).toContain(`${esc}[37A`);
  expect(output).toContain(`${esc}[42C`);
  expect(firstFrames()).toBe(1);
});

test("kitty: alternates image ids and deletes the previous frame", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness("kitty");
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
  const {painter, writes} = createHarness("kitty");
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

test("holds the frame until a region is known", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness("kitty");
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  expect(writes).toHaveLength(0);
  painter.setRegion(region);
  await idle();
  expect(writes).toHaveLength(1);
});

test("kitty: repaint re-places without retransmitting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness("kitty");
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  painter.repaint();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toContain("_Ga=p,i=4041");
  expect(writes[1]).not.toContain("_Gf=100");
});

test("kitty: stop deletes the active image", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness("kitty");
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.png", makePng(1280, 800)));
  await idle();
  painter.stop();
  expect(writes.at(-1)).toBe(`${esc}_Ga=d,d=I,i=4041,q=2${esc}\\`);
  painter.submitFrame(join(dir, "f1.png"));
  await idle();
  expect(writes).toHaveLength(2);
});

test("iterm2: writes the inline file payload sized to the region", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness("iterm2");
  const bytes = makePng(1280, 800);
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.jpeg", bytes));
  await idle();
  expect(writes).toHaveLength(1);
  const output = writes[0]!;
  expect(output).toContain(
    `]1337;File=inline=1;size=${bytes.byteLength};width=56;height=20;preserveAspectRatio=1:`
  );
  expect(output).toContain(Buffer.from(bytes).toString("base64"));
});

test("iterm2: repaint rewrites the last payload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "painter-"));
  const {painter, writes} = createHarness("iterm2");
  painter.setRegion(region);
  painter.submitFrame(await writeFrame(dir, "f1.jpeg", makePng(1280, 800)));
  await idle();
  painter.repaint();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toBe(writes[0]);
});
