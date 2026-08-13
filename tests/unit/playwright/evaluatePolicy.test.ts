import {expect, test} from "bun:test";
import {evaluatePolicy} from "../../../src/playwright/index.js";

test("auto-allows managed browser commands and denies unknown commands", () => {
  expect(evaluatePolicy({id: "1", command: "click", args: []})).toEqual({
    kind: "allow"
  });
  expect(evaluatePolicy({id: "2", command: "eval", args: []})).toEqual({
    kind: "allow"
  });
  expect(evaluatePolicy({id: "3", command: "shell", args: []}).kind).toBe(
    "deny"
  );
  expect(
    evaluatePolicy({
      id: "4",
      command: "run-code",
      args: ["async page => page.url()"]
    })
  ).toEqual({kind: "allow"});
  expect(
    evaluatePolicy({id: "file", command: "goto", args: ["file:///etc/passwd"]})
  ).toEqual({
    kind: "deny",
    reason: "Local file navigation is outside the managed browser session"
  });
});

test("classifies the expanded Playwright CLI surface", () => {
  expect(evaluatePolicy({id: "5", command: "cookie-list", args: []})).toEqual({
    kind: "allow"
  });
  expect(
    evaluatePolicy({id: "6", command: "response-body", args: ["1"]})
  ).toEqual({
    kind: "allow"
  });
  expect(evaluatePolicy({id: "7", command: "dialog-accept", args: []})).toEqual(
    {kind: "allow"}
  );
  expect(
    evaluatePolicy({id: "8", command: "network-state-set", args: ["offline"]})
  ).toEqual({kind: "allow"});
  expect(
    evaluatePolicy({id: "9", command: "video-chapter", args: ["Checkout"]}).kind
  ).toBe("allow");
  expect(evaluatePolicy({id: "10", command: "pause-at", args: []})).toEqual({
    kind: "allow"
  });
  expect(evaluatePolicy({id: "11", command: "config-print", args: []})).toEqual(
    {kind: "allow"}
  );
  expect(evaluatePolicy({id: "12", command: "kill-all", args: []}).kind).toBe(
    "deny"
  );
});
