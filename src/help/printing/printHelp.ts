import {formatCommandSections} from "./formatCommandSections.js";

export function printHelp(): void {
  process.stdout.write(`Parterre

Usage:
  parterre run [options]
  parterre setup                Choose the agent (Codex, Copilot, Claude, or an API endpoint)
  parterre sessions [--storage <path>]
  parterre replay <session-id> [--storage <path>]
  parterre delete <session-id> [--storage <path>]

Run options:
  --provider <name>    Agent: auto, codex, copilot, claude, or openai (default: auto)
  --base-url <url>     OpenAI-compatible endpoint, required with --provider openai
  --model <model>       Model id (default: auto)
  --workspace <path>   Agent and Playwright working directory
  --storage <path>     Session storage directory
  --playwright <path>  playwright-cli executable
  --redact <value>     Repeatable value removed from persisted events

${formatCommandSections()}

The Codex SDK, GitHub Copilot SDK, Claude Agent SDK, or Parterre's own loop
against any OpenAI-compatible endpoint provides the main agent. The TUI exposes an
allowlisted Playwright CLI tool and renders its isolated browser inside the
terminal.
`);
}
