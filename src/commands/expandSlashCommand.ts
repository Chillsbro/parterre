import {slashCommands} from "./slashCommands.js";

export interface ExpandedCommand {
  display: string;
  prompt: string;
}

export function expandSlashCommand(input: string): ExpandedCommand | undefined {
  const trimmedInput = input.trim();
  const firstSpace = trimmedInput.indexOf(" ");
  const word = (
    firstSpace === -1 ? trimmedInput : trimmedInput.slice(0, firstSpace)
  ).toLowerCase();
  if (!word.startsWith("/")) {
    return {display: trimmedInput, prompt: trimmedInput};
  }
  const match = slashCommands.find(item => item.command === word);
  if (!match || match.local) return undefined;
  const body =
    firstSpace === -1 ? "" : trimmedInput.slice(firstSpace + 1).trim();
  return {
    display: trimmedInput,
    prompt: `${match.instructions}\n${body || match.askFallback}`
  };
}
