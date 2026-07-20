import {type SlashCommandDefinition, slashCommands} from "./slashCommands.js";

export const maxSlashCommandRows = 6;

export function matchSlashCommands(input: string): SlashCommandDefinition[] {
  const word = input.trimStart().split(/\s/, 1)[0]?.toLowerCase() ?? "";
  if (!word.startsWith("/")) return [];
  return slashCommands.filter(item => item.command.startsWith(word));
}
