import {expect, test} from "bun:test";
import type {Dispatch} from "react";
import {createSendMessage} from "../../../src/app/sending/index.js";
import type {AppAction} from "../../../src/app/state/index.js";
import type {RuntimeController} from "../../../src/runtime/index.js";

function createDeps() {
  const actions: AppAction[] = [];
  const errors: unknown[] = [];
  const sent: string[][] = [];
  const runtime = {
    sendUserMessage: async (
      prompt: string,
      _wait?: boolean,
      display?: string
    ) => {
      sent.push([prompt, display ?? prompt]);
    }
  } as unknown as RuntimeController;
  return {
    actions,
    errors,
    sent,
    deps: {
      runtimeRef: {current: runtime as RuntimeController | undefined},
      dispatch: (action => actions.push(action)) as Dispatch<AppAction>,
      stopRuntime: async () => {},
      exit: () => {},
      openModelPicker: () => {},
      currentModel: "auto",
      reportHostError: (error: unknown) => errors.push(error),
      workspace: "/workspace"
    }
  };
}

test("routes /clear to the reducer and resets the input", () => {
  const {deps, actions} = createDeps();
  createSendMessage(deps)("/clear");
  expect(actions).toEqual([{type: "input", input: ""}, {type: "clearEvents"}]);
});

test("reports unknown commands without clearing the input", () => {
  const {deps, actions, errors} = createDeps();
  createSendMessage(deps)("/nope");
  expect(actions).toEqual([]);
  expect(errors).toHaveLength(1);
  expect(String(errors[0])).toContain("Unknown command: /nope");
});

test("expands prompt commands and sends them to the agent", () => {
  const {deps, sent} = createDeps();
  createSendMessage(deps)("/test log in and check the dashboard");
  expect(sent).toHaveLength(1);
  expect(sent[0]?.[0]).toContain("log in and check the dashboard");
  expect(sent[0]?.[1]).toBe("/test log in and check the dashboard");
});

test("sends plain text through unchanged", () => {
  const {deps, sent} = createDeps();
  createSendMessage(deps)("hello there");
  expect(sent).toEqual([["hello there", "hello there"]]);
});
