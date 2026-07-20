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
    pendingApproval: false
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
    pendingApproval: false
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
    pendingApproval: false
  });
  expect(withPicker.showActionBar).toBe(false);
  const withApproval = computeAppLayout({
    rows: 40,
    columns: 120,
    browserFocused: false,
    hasActivity: false,
    commandMatchCount: 3,
    modelPickerCount: undefined,
    pendingApproval: true
  });
  expect(withApproval.showActionBar).toBe(false);
  expect(withApproval.transcriptHeight).toBe(33);
});
