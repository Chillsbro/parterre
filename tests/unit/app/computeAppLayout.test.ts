import {expect, test} from "bun:test";
import {computeAppLayout} from "../../../src/app/index.js";

test("sizes the panes and reserves rows for the action bar", () => {
  const layout = computeAppLayout({
    rows: 40,
    columns: 120,
    browserFocused: false,
    hasActivity: true,
    commandMatchCount: 3,
    modelPickerCount: undefined,
    pendingApproval: false,
    composerInput: ""
  });
  expect(layout.mainHeight).toBe(38);
  expect(layout.leftWidth).toBe(48);
  expect(layout.browserWidth).toBe(72);
  expect(layout.activityHeight).toBe(1);
  expect(layout.showActionBar).toBe(true);
  expect(layout.transcriptHeight).toBe(31);
});

test("collapses the left pane when the browser is focused", () => {
  const layout = computeAppLayout({
    rows: 30,
    columns: 100,
    browserFocused: true,
    hasActivity: false,
    commandMatchCount: 0,
    modelPickerCount: undefined,
    pendingApproval: false,
    composerInput: ""
  });
  expect(layout.leftWidth).toBe(0);
  expect(layout.browserWidth).toBe(100);
  expect(layout.showActionBar).toBe(false);
});

test("hides the action bar while the model picker or an approval is open", () => {
  const withPicker = computeAppLayout({
    rows: 40,
    columns: 120,
    browserFocused: false,
    hasActivity: false,
    commandMatchCount: 3,
    modelPickerCount: 4,
    pendingApproval: false,
    composerInput: ""
  });
  expect(withPicker.showActionBar).toBe(false);
  const withApproval = computeAppLayout({
    rows: 40,
    columns: 120,
    browserFocused: false,
    hasActivity: false,
    commandMatchCount: 3,
    modelPickerCount: undefined,
    pendingApproval: true,
    composerInput: ""
  });
  expect(withApproval.showActionBar).toBe(false);
  expect(withApproval.transcriptHeight).toBe(33);
});

test("gives wrapped composer rows back from the transcript", () => {
  const short = computeAppLayout({
    rows: 30,
    columns: 100,
    browserFocused: false,
    hasActivity: false,
    commandMatchCount: 0,
    modelPickerCount: undefined,
    pendingApproval: false,
    composerInput: "short"
  });
  const wrapped = computeAppLayout({
    rows: 30,
    columns: 100,
    browserFocused: false,
    hasActivity: false,
    commandMatchCount: 0,
    modelPickerCount: undefined,
    pendingApproval: false,
    composerInput: "a".repeat(100)
  });

  expect(short.composerHeight).toBe(3);
  expect(wrapped.composerHeight).toBeGreaterThan(short.composerHeight);
  expect(wrapped.transcriptHeight).toBe(
    short.transcriptHeight - (wrapped.composerHeight - short.composerHeight)
  );
});

test("compacts a wrapped draft before it overflows a short terminal", () => {
  const layout = computeAppLayout({
    rows: 14,
    columns: 100,
    browserFocused: false,
    hasActivity: false,
    commandMatchCount: 0,
    modelPickerCount: undefined,
    pendingApproval: false,
    composerInput: "a".repeat(200)
  });

  expect(layout.mainHeight).toBe(12);
  expect(layout.compactComposer).toBe(true);
  expect(layout.composerHeight).toBe(3);
  expect(layout.transcriptHeight).toBe(9);
  expect(
    layout.transcriptHeight + layout.activityHeight + layout.composerHeight
  ).toBe(layout.mainHeight);
});

test("caps slash-command suggestions inside a short terminal", () => {
  const layout = computeAppLayout({
    rows: 14,
    columns: 100,
    browserFocused: false,
    hasActivity: false,
    commandMatchCount: 7,
    modelPickerCount: undefined,
    pendingApproval: false,
    composerInput: "/"
  });

  expect(layout.mainHeight).toBe(12);
  expect(layout.actionBarHeight).toBe(5);
  expect(layout.composerHeight).toBe(3);
  expect(layout.transcriptHeight).toBe(4);
  expect(
    layout.transcriptHeight +
      layout.activityHeight +
      layout.actionBarHeight +
      layout.composerHeight
  ).toBe(layout.mainHeight);
});
