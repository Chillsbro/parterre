import {expect, test} from "bun:test";
import {isCliStartTimeout} from "../../../src/runtime/providers/isCliStartTimeout.js";

test("matches the Copilot SDK start-timeout error", () => {
  expect(
    isCliStartTimeout(new Error("Timeout waiting for CLI server to start"))
  ).toBe(true);
});

test("matches the message regardless of case", () => {
  expect(isCliStartTimeout("timeout waiting for cli server to start")).toBe(
    true
  );
});

test("does not match an unrelated startup failure", () => {
  expect(isCliStartTimeout(new Error("CLI server exited with code 1"))).toBe(
    false
  );
});

test("does not match a missing-binary error", () => {
  expect(isCliStartTimeout(new Error("ENOENT: copilot not found"))).toBe(false);
});
