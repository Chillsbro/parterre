import {expect, test} from "bun:test";
import {expandSlashCommand} from "../../../src/commands/index.js";

test("expands a test workflow into a playwright_cli prompt", () => {
  const command = expandSlashCommand("/test checkout flow");
  expect(command?.display).toBe("/test checkout flow");
  expect(command?.prompt).toContain(
    "Use playwright_cli to execute this browser test workflow manually"
  );
  expect(command?.prompt).toContain("materialize_target_test");
  expect(command?.prompt).toContain("checkout flow");
});

test("falls back to asking for input when the body is empty", () => {
  const command = expandSlashCommand("/test");
  expect(command?.prompt).toContain("Ask me what workflow to test.");
});

test("returns undefined for unknown slash commands", () => {
  expect(expandSlashCommand("/isnpect header")).toBeUndefined();
  expect(expandSlashCommand("/ac login works")).toBeUndefined();
});

test("passes ordinary messages through unchanged", () => {
  expect(expandSlashCommand("Open example.com")).toEqual({
    display: "Open example.com",
    prompt: "Open example.com"
  });
});
