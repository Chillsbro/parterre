export interface SlashCommandHelp {
  usage: string;
  description: string;
}

interface SlashCommandBase {
  command: `/${string}`;
  label: string;
  result: string;
  section: "workflow" | "knowledge" | "tui";
  help: readonly SlashCommandHelp[];
}

export interface PromptSlashCommand extends SlashCommandBase {
  local: false;
  instructions: string;
  askFallback: string;
}

export interface LocalSlashCommand extends SlashCommandBase {
  local: true;
}

export type SlashCommandDefinition = PromptSlashCommand | LocalSlashCommand;

export const slashCommands = [
  {
    command: "/test",
    label: "Test workflow",
    result: "evidence",
    section: "workflow",
    help: [
      {
        usage: "/test <workflow>",
        description: "Prove a browser workflow and write its automation"
      }
    ],
    local: false,
    instructions:
      "Use playwright_cli to execute this browser test workflow manually, then prove its expected outcomes with one or more passing browser_assert calls. If it passes, query the target repo's learned testing conventions; when no profile exists or it lacks testing detail, inspect its instructions, manifest, and nearby tests with read_codebase. Generate matching automation that reproduces every browser_assert testHint, then call materialize_target_test with all passing assertion IDs to write and execute it. Revise only the generated test until its conventional test command exits successfully. Report concise assertion evidence, the written path, command, exit code, failures, and final state:",
    askFallback: "Ask me what workflow to test."
  },
  {
    command: "/inspect",
    label: "Inspect page",
    result: "report",
    section: "workflow",
    help: [
      {
        usage: "/inspect <target>",
        description: "Inspect structure, accessibility, console, and network"
      }
    ],
    local: false,
    instructions:
      "Inspect this page or target with playwright_cli. Check structure, accessibility, console errors, and relevant network activity, then return prioritized findings:",
    askFallback: "Ask me which page or target to inspect."
  },
  {
    command: "/learn",
    label: "Learn codebase",
    result: "profile",
    section: "knowledge",
    help: [
      {
        usage: "/learn [path]",
        description: "Learn a codebase's coding habits (defaults to workspace)"
      },
      {
        usage: "/learn refresh [path]",
        description: "Re-learn a codebase's habits from scratch"
      }
    ],
    local: true
  },
  {
    command: "/model",
    label: "Switch model",
    result: "picker",
    section: "tui",
    help: [
      {
        usage: "/model [id]",
        description: "Switch the model (picker when no id is given)"
      }
    ],
    local: true
  },
  {
    command: "/clear",
    label: "Clear transcript",
    result: "clean slate",
    section: "tui",
    help: [{usage: "/clear", description: "Clear the transcript"}],
    local: true
  },
  {
    command: "/quit",
    label: "Quit",
    result: "exit",
    section: "tui",
    help: [{usage: "/quit", description: "Stop the session and exit"}],
    local: true
  }
] as const satisfies readonly SlashCommandDefinition[];

export type LocalSlashCommandName = Extract<
  (typeof slashCommands)[number],
  {local: true}
>["command"];
