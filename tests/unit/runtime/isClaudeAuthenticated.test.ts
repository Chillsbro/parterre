import {expect, test} from "bun:test";
import {isClaudeAuthenticated} from "../../../src/runtime/providers/isClaudeAuthenticated.js";

test("accepts a logged-in first-party account", () => {
  expect(
    isClaudeAuthenticated(
      {email: "a@b.com", apiProvider: "firstParty"},
      undefined
    )
  ).toBe(true);
});

test("accepts a third-party account with no email but an api provider", () => {
  expect(isClaudeAuthenticated({apiProvider: "bedrock"}, undefined)).toBe(true);
});

test("accepts an api key even without any account info", () => {
  expect(isClaudeAuthenticated(undefined, "sk-ant-123")).toBe(true);
});

test("rejects a missing account and no api key", () => {
  expect(isClaudeAuthenticated(undefined, undefined)).toBe(false);
});

test("rejects an empty account object and no api key", () => {
  expect(isClaudeAuthenticated({}, undefined)).toBe(false);
});

test("rejects an empty api key string", () => {
  expect(isClaudeAuthenticated({}, "")).toBe(false);
});
