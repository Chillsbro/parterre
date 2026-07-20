import {maxSlashCommandRows} from "../../commands/index.js";

export interface AppLayoutInput {
  rows: number;
  columns: number;
  browserFocused: boolean;
  hasActivity: boolean;
  commandMatchCount: number;
  modelPickerCount: number | undefined;
  pendingApproval: boolean;
}

export interface AppLayout {
  mainHeight: number;
  leftWidth: number;
  browserWidth: number;
  activityHeight: number;
  transcriptHeight: number;
  showActionBar: boolean;
}

export function computeAppLayout(input: AppLayoutInput): AppLayout {
  const statusHeight = 2;
  const mainHeight = Math.max(8, input.rows - statusHeight);
  const leftWidth = input.browserFocused
    ? 0
    : Math.min(52, Math.max(30, Math.floor(input.columns * 0.4)));
  const browserWidth = Math.max(20, input.columns - leftWidth);
  const activityHeight = input.hasActivity ? 1 : 0;
  const controlHeight =
    input.modelPickerCount !== undefined
      ? Math.min(8, Math.max(input.modelPickerCount, 1)) + 3
      : input.pendingApproval
        ? 5
        : 3;
  const showActionBar =
    input.commandMatchCount > 0 &&
    input.modelPickerCount === undefined &&
    !input.pendingApproval;
  const actionBarHeight =
    Math.min(input.commandMatchCount, maxSlashCommandRows) +
    (input.commandMatchCount > maxSlashCommandRows ? 1 : 0);
  const transcriptHeight = Math.max(
    4,
    mainHeight -
      controlHeight -
      activityHeight -
      (showActionBar ? actionBarHeight : 0)
  );
  return {
    mainHeight,
    leftWidth,
    browserWidth,
    activityHeight,
    transcriptHeight,
    showActionBar
  };
}
