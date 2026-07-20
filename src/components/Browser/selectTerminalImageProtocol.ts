import type {ImageProtocolName, TerminalInfo} from "ink-picture";
import {selectImageProtocol} from "../../terminal/index.js";

export function selectTerminalImageProtocol(
  terminalInfo: TerminalInfo,
  env: NodeJS.ProcessEnv = process.env
): ImageProtocolName {
  return selectImageProtocol(terminalInfo, env);
}
