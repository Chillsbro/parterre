import {expect, test} from "bun:test";
import {parseMouseInput} from "../../../src/terminal/index.js";

test("passes plain text and keyboard sequences through untouched", () => {
  const parsed = parseMouseInput("hello \x1b[A world");
  expect(parsed.text).toBe("hello \x1b[A world");
  expect(parsed.wheel).toEqual([]);
  expect(parsed.pending).toBe("");
});

test("extracts SGR wheel events and strips them from the stream", () => {
  const parsed = parseMouseInput("a\x1b[<64;10;5Mb\x1b[<65;10;5Mc");
  expect(parsed.text).toBe("abc");
  expect(parsed.wheel).toEqual([{direction: -1}, {direction: 1}]);
});

test("strips clicks, drags, and horizontal wheel without emitting", () => {
  const parsed = parseMouseInput(
    "\x1b[<0;3;4M\x1b[<0;3;4m\x1b[<32;5;5M\x1b[<66;1;1M\x1b[<67;1;1M"
  );
  expect(parsed.text).toBe("");
  expect(parsed.wheel).toEqual([]);
});

test("holds back an incomplete mouse sequence as pending", () => {
  const first = parseMouseInput("x\x1b[<6");
  expect(first.text).toBe("x");
  expect(first.wheel).toEqual([]);
  expect(first.pending).toBe("\x1b[<6");
  const second = parseMouseInput(`${first.pending}5;1;1My`);
  expect(second.text).toBe("y");
  expect(second.wheel).toEqual([{direction: 1}]);
  expect(second.pending).toBe("");
});

test("extracts X11 wheel events", () => {
  const up = `\x1b[M${String.fromCharCode(96, 33, 33)}`;
  const down = `\x1b[M${String.fromCharCode(97, 33, 33)}`;
  const parsed = parseMouseInput(`${up}${down}`);
  expect(parsed.text).toBe("");
  expect(parsed.wheel).toEqual([{direction: -1}, {direction: 1}]);
});
