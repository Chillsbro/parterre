import type {SDKUserMessage} from "@anthropic-ai/claude-agent-sdk";
import type {ProviderName} from "../../config/index.js";
import {loadAdapterModule} from "./adapterModules.js";
import {isClaudeAuthenticated} from "./isClaudeAuthenticated.js";
import {isCodexAuthenticated} from "./isCodexAuthenticated.js";

type DiscoverableProvider = "codex" | "copilot" | "claude";
type AuthenticationProbe = () => Promise<boolean>;

async function isCopilotAuthenticated(): Promise<boolean> {
  try {
    const {CopilotClient} = await loadAdapterModule<
      typeof import("@github/copilot-sdk")
    >("@github/copilot-sdk");
    const client = new CopilotClient({workingDirectory: process.cwd()});
    try {
      await client.start();
      return (await client.getAuthStatus()).isAuthenticated;
    } finally {
      await client.stop().catch(() => {});
    }
  } catch {
    return false;
  }
}

async function isClaudeAccountAuthenticated(): Promise<boolean> {
  try {
    const {query} = await loadAdapterModule<
      typeof import("@anthropic-ai/claude-agent-sdk")
    >("@anthropic-ai/claude-agent-sdk");
    async function* noMessages(): AsyncGenerator<SDKUserMessage> {}
    const accountQuery = query({
      prompt: noMessages(),
      options: {tools: []}
    });
    try {
      const account = await accountQuery.accountInfo().catch(() => undefined);
      return isClaudeAuthenticated(account, process.env.ANTHROPIC_API_KEY);
    } finally {
      accountQuery.close();
    }
  } catch {
    return false;
  }
}

const defaultProbes: Record<DiscoverableProvider, AuthenticationProbe> = {
  codex: isCodexAuthenticated,
  copilot: isCopilotAuthenticated,
  claude: isClaudeAccountAuthenticated
};

export async function detectAuthenticatedProviders(
  providers: ProviderName[] = ["codex", "copilot", "claude"],
  probes: Record<DiscoverableProvider, AuthenticationProbe> = defaultProbes
): Promise<DiscoverableProvider[]> {
  const authenticated: DiscoverableProvider[] = [];
  for (const provider of providers) {
    if (!Object.hasOwn(probes, provider)) continue;
    const discoverable = provider as DiscoverableProvider;
    if (await probes[discoverable]()) authenticated.push(discoverable);
  }
  return authenticated;
}
