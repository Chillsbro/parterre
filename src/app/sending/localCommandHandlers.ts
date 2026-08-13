import type {LocalSlashCommandName} from "../../commands/index.js";
import type {SendMessageDeps} from "./createSendMessage.js";
import {sendLearnCommand} from "./sendLearnCommand.js";

type LocalCommandHandler = (rest: string[], deps: SendMessageDeps) => void;

const localCommandHandlers: Record<LocalSlashCommandName, LocalCommandHandler> =
  {
    "/quit": (_rest, deps) => {
      void deps.stopRuntime().then(
        () => deps.exit(),
        error =>
          deps.exit(error instanceof Error ? error : new Error(String(error)))
      );
    },
    "/clear": (_rest, deps) => {
      deps.dispatch({type: "clearEvents"});
      void deps.runtimeRef.current
        ?.clearTranscript()
        .catch(deps.reportHostError);
    },
    "/model": (rest, deps) => {
      const target = rest.join(" ").trim();
      if (target) {
        void deps.runtimeRef.current
          ?.setModel(target)
          .catch(deps.reportHostError);
      } else {
        deps.openModelPicker(deps.currentModel);
      }
    },
    "/learn": (rest, deps) => {
      const runtime = deps.runtimeRef.current;
      if (!runtime) return;
      void sendLearnCommand(runtime, rest, deps.workspace).catch(
        deps.reportHostError
      );
    }
  };

export function findLocalCommandHandler(
  command: string
): LocalCommandHandler | undefined {
  return Object.hasOwn(localCommandHandlers, command)
    ? localCommandHandlers[command as LocalSlashCommandName]
    : undefined;
}
