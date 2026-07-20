import {expect, test} from "bun:test";
import {sanitizePlaywrightArgs} from "../../../src/playwright/index.js";

test("owns browser launch mode, config, and artifact paths", () => {
  expect(
    sanitizePlaywrightArgs([
      "https://example.com",
      "--headed",
      "--headless",
      "--config=untrusted.json",
      "--filename=C:\\outside.png",
      42
    ])
  ).toEqual(["https://example.com", "42"]);
});
