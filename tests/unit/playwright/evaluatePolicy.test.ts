import {expect, test} from "bun:test";
import {evaluatePolicy} from "../../../src/playwright/index.js";

test("allows browser actions, approves mutations, and denies unknown commands", () => {
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
      command: "open",
      args: ["https://example.com", "--persistent"]
    }).kind
  ).toBe("approval");
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
      .kind
  ).toBe("approval");
  expect(
    evaluatePolicy({id: "9", command: "video-chapter", args: ["Checkout"]}).kind
  ).toBe("approval");
});
