import {expect, test} from "bun:test";
import {EventEmitter} from "node:events";
import {
  createMouseStdin,
  type MouseWheelEvent
} from "../../../src/terminal/index.js";

class FakeSource extends EventEmitter {
  isTTY = true;
  rawMode = false;
  setRawMode(mode: boolean): this {
    this.rawMode = mode;
    return this;
  }
  ref(): this {
    return this;
  }
  unref(): this {
    return this;
  }
}

class FakeOutput {
  isTTY = true;
  written = "";
  write(chunk: string): boolean {
    this.written += chunk;
    return true;
  }
}

function setup() {
  const source = new FakeSource();
  const output = new FakeOutput();
  const mouse = createMouseStdin(
    source as unknown as NodeJS.ReadStream,
    output as unknown as NodeJS.WriteStream
  );
  return {source, output, mouse};
}

test("emits wheel events and forwards only keyboard input to ink", async () => {
  const {source, mouse} = setup();
  const events: MouseWheelEvent[] = [];
  const forwarded: string[] = [];
  mouse.stdin.setEncoding("utf8");
  mouse.stdin.on("data", chunk => forwarded.push(String(chunk)));
  mouse.subscribeWheel(event => events.push(event));
  source.emit("data", Buffer.from("a\x1b[<64;10;5M\x1b[<0;3;4Mb"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(events).toEqual([{direction: -1}]);
  expect(forwarded.join("")).toBe("ab");
  mouse.detach();
});

test("reassembles a wheel sequence split across chunks", async () => {
  const {source, mouse} = setup();
  const events: MouseWheelEvent[] = [];
  mouse.subscribeWheel(event => events.push(event));
  source.emit("data", Buffer.from("\x1b[<6"));
  source.emit("data", Buffer.from("5;10;5M"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(events).toEqual([{direction: 1}]);
  mouse.detach();
});

test("flushes a held escape key to ink after the grace period", async () => {
  const {source, mouse} = setup();
  const forwarded: string[] = [];
  mouse.stdin.setEncoding("utf8");
  mouse.stdin.on("data", chunk => forwarded.push(String(chunk)));
  source.emit("data", Buffer.from("\x1b"));
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(forwarded.join("")).toBe("\x1b");
  mouse.detach();
});

test("toggles terminal mouse tracking and delegates raw mode", () => {
  const {source, output, mouse} = setup();
  mouse.enableTracking();
  expect(output.written).toBe("\x1b[?1002h\x1b[?1006h");
  mouse.disableTracking();
  expect(output.written).toBe("\x1b[?1002h\x1b[?1006h\x1b[?1006l\x1b[?1002l");
  (mouse.stdin as unknown as FakeSource).setRawMode(true);
  expect(source.rawMode).toBe(true);
  mouse.detach();
});
