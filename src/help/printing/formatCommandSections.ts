import {
  type SlashCommandDefinition,
  type SlashCommandHelp,
  slashCommands
} from "../../commands/index.js";

const sections: readonly {
  key: SlashCommandDefinition["section"];
  title: string;
}[] = [
  {key: "workflow", title: "Workflow commands"},
  {key: "knowledge", title: "Knowledge commands"},
  {key: "tui", title: "TUI commands"}
];

export function formatCommandSections(): string {
  return sections
    .map(section => {
      const rows = slashCommands
        .filter(item => item.section === section.key)
        .flatMap((item): readonly SlashCommandHelp[] => item.help)
        .map(row => `  ${row.usage.padEnd(20)} ${row.description}`)
        .join("\n");
      return `${section.title}:\n${rows}`;
    })
    .join("\n\n");
}
