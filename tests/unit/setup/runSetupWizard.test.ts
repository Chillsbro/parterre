import {expect, test} from "bun:test";
import {
  authenticatedMessage,
  endpointDefaultsFrom
} from "../../../src/setup/running/runSetupWizard.js";

test("rejects unknown endpoint choices", () => {
  expect(() => endpointDefaultsFrom("banana")).toThrow(
    "Choose an endpoint from 1 through 4"
  );
});

test("directs the user to start after finding an authenticated provider", () => {
  expect(authenticatedMessage(["codex"])).toBe(
    "Found authenticated Codex.\n\nRun `parterre run` to start a session."
  );
});

test("names every authenticated provider without exposing account details", () => {
  expect(authenticatedMessage(["codex", "claude"])).toBe(
    "Found authenticated Codex and Claude Code.\n\n" +
      "Run `parterre run` to start a session."
  );
});
