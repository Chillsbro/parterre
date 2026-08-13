import {maxSlashCommandRows} from "../../commands/index.js";
import {
  compactComposerHeight,
  computeComposerLayout
} from "./computeComposerLayout.js";

const minimumTranscriptHeight = 4;

export interface AppLayoutInput {
  rows: number;
  columns: number;
  browserFocused: boolean;
  hasActivity: boolean;
  commandMatchCount: number;
  modelPickerCount: number | undefined;
  pendingApproval: boolean;
  composerInput: string;
}

export interface AppLayout {
  mainHeight: number;
  leftWidth: number;
  browserWidth: number;
  activityHeight: number;
  composerHeight: number;
  compactComposer: boolean;
  transcriptHeight: number;
  showActionBar: boolean;
  actionBarHeight: number;
}

export function computeAppLayout(input: AppLayoutInput): AppLayout {
  const statusHeight = 2;
  const mainHeight = Math.max(8, input.rows - statusHeight);
  const leftWidth = input.browserFocused
    ? 0
    : Math.min(52, Math.max(30, Math.floor(input.columns * 0.4)));
  const browserWidth = Math.max(20, input.columns - leftWidth);
  const activityHeight = input.hasActivity ? 1 : 0;
  const requestedComposer = computeComposerLayout(
    input.composerInput,
    Math.max(1, leftWidth - 1)
  );
  const showActionBar =
    input.commandMatchCount > 0 &&
    input.modelPickerCount === undefined &&
    !input.pendingApproval;
  const requestedActionBarHeight =
    Math.min(input.commandMatchCount, maxSlashCommandRows) +
    (input.commandMatchCount > maxSlashCommandRows ? 1 : 0);
  const maximumActionBarHeight = Math.max(
    0,
    mainHeight -
      minimumTranscriptHeight -
      activityHeight -
      compactComposerHeight
  );
  const actionBarHeight = showActionBar
    ? Math.min(requestedActionBarHeight, maximumActionBarHeight)
    : 0;
  const maximumComposerHeight = Math.max(
    compactComposerHeight,
    mainHeight - minimumTranscriptHeight - activityHeight - actionBarHeight
  );
  const compactComposer =
    requestedComposer.compact ||
    requestedComposer.height > maximumComposerHeight;
  const composerHeight = compactComposer
    ? compactComposerHeight
    : requestedComposer.height;
  const controlHeight =
    input.modelPickerCount !== undefined
      ? Math.min(8, Math.max(input.modelPickerCount, 1)) + 3
      : input.pendingApproval
        ? 5
        : composerHeight;
  const transcriptHeight = Math.max(
    minimumTranscriptHeight,
    mainHeight - controlHeight - activityHeight - actionBarHeight
  );
  return {
    mainHeight,
    leftWidth,
    browserWidth,
    activityHeight,
    composerHeight,
    compactComposer,
    transcriptHeight,
    showActionBar: showActionBar && actionBarHeight > 0,
    actionBarHeight
  };
}
