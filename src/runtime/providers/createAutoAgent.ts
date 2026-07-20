import type {
  AgentFactory,
  AgentFactoryOptions,
  AgentHandle
} from "./AgentProvider.js";

interface Candidate {
  name: string;
  load(): Promise<AgentFactory>;
}

const candidates: Candidate[] = [
  {
    name: "Codex",
    load: async () => (await import("./createCodexAgent.js")).createCodexAgent
  },
  {
    name: "GitHub Copilot",
    load: async () =>
      (await import("./createCopilotAgent.js")).createCopilotAgent
  },
  {
    name: "Claude Code",
    load: async () => (await import("./createClaudeAgent.js")).createClaudeAgent
  }
];

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createAutoAgent(
  options: AgentFactoryOptions,
  providers: Candidate[] = candidates
): Promise<AgentHandle> {
  const attempts = options.baseUrl
    ? [
        ...providers,
        {
          name: "OpenAI-compatible endpoint",
          load: async () =>
            (await import("./createOpenAiAgent.js")).createOpenAiAgent
        }
      ]
    : providers;
  const failures: string[] = [];

  for (const candidate of attempts) {
    try {
      return await (await candidate.load())(options);
    } catch (error) {
      failures.push(`${candidate.name}: ${describeError(error)}`);
    }
  }

  throw new Error(
    "No authenticated agent provider is available.\n" +
      failures.map(failure => `  - ${failure}`).join("\n") +
      "\nInstall and sign in to a provider adapter, or run `parterre setup` to configure a hosted API."
  );
}
