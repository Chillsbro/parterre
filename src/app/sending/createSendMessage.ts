import type {Dispatch} from "react";
import {expandSlashCommand} from "../../commands/index.js";
import type {RuntimeController} from "../../runtime/index.js";
import type {AppAction} from "../state/index.js";
import {findLocalCommandHandler} from "./localCommandHandlers.js";

export interface SendMessageDeps {
  runtimeRef: {current: RuntimeController | undefined};
  dispatch: Dispatch<AppAction>;
  stopRuntime: () => Promise<void>;
  exit: (error?: Error) => void;
  openModelPicker: (activeModel: string) => void;
  currentModel: string;
  reportHostError: (error: unknown) => void;
  workspace: string;
}

export function createSendMessage(
  deps: SendMessageDeps
): (input: string) => void {
  return (input: string): void => {
    const content = input.trim();
    if (!content) return;
    const [word = "", ...rest] = content.split(/\s+/);
    const command = word.toLowerCase();
    const handler = findLocalCommandHandler(command);
    if (handler) {
      deps.dispatch({type: "input", input: ""});
      handler(rest, deps);
      return;
    }
    const runtime = deps.runtimeRef.current;
    if (!runtime) return;
    const expandedCommand = expandSlashCommand(content);
    if (!expandedCommand) {
      deps.reportHostError(new Error(`Unknown command: ${command}`));
      return;
    }
    deps.dispatch({type: "input", input: ""});
    void runtime.sendUserMessage(
      expandedCommand.prompt,
      false,
      expandedCommand.display
    );
  };
}
