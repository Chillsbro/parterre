import {createInterface} from "node:readline/promises";
import type {ProviderName} from "../../config/index.js";
import {getUserConfigPath, writeUserConfig} from "../../config/index.js";
import {detectAuthenticatedProviders} from "../../runtime/providers/detectAuthenticatedProviders.js";
import {installBrowser} from "./installBrowser.js";
import {installProviderAdapter} from "./installProviderAdapter.js";

const openAiBaseUrl = "https://api.openai.com/v1";
const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const ollamaBaseUrl = "http://localhost:11434/v1";

interface EndpointDefaults {
  baseUrl: string;
  model: string;
}

function providerFrom(answer: string): ProviderName {
  if (answer === "1" || answer === "codex") return "codex";
  if (answer === "2" || answer === "copilot") return "copilot";
  if (answer === "3" || answer === "claude") return "claude";
  if (answer === "4" || answer === "api" || answer === "openai") {
    return "openai";
  }
  if (answer === "5" || answer === "auto" || answer === "automatic") {
    return "auto";
  }
  throw new Error("Choose a provider from 1 through 5");
}

async function chooseEndpoint(
  readline: ReturnType<typeof createInterface>
): Promise<{baseUrl: string; model: string}> {
  process.stdout.write(
    "\nWhich OpenAI-compatible endpoint?\n\n" +
      "  1. OpenAI       (OPENAI_API_KEY)\n" +
      "  2. OpenRouter   (set its key as OPENAI_API_KEY)\n" +
      "  3. Ollama       (local, usually no key)\n" +
      "  4. Custom URL\n\n"
  );
  const answer = (await readline.question("Choice [1/2/3/4]: "))
    .trim()
    .toLowerCase();
  let defaults: EndpointDefaults;
  if (answer === "4" || answer === "custom") {
    const custom = (await readline.question("Base URL: ")).trim();
    if (!custom) throw new Error("A custom endpoint requires a base URL");
    defaults = {baseUrl: custom, model: "auto"};
  } else {
    defaults = endpointDefaultsFrom(answer);
  }
  const model = (await readline.question(`Model [${defaults.model}]: `)).trim();
  return {...defaults, model: model || defaults.model};
}

export function endpointDefaultsFrom(answer: string): EndpointDefaults {
  if (answer === "1" || answer === "openai") {
    return {baseUrl: openAiBaseUrl, model: "gpt-4.1-mini"};
  }
  if (answer === "2" || answer === "openrouter") {
    return {baseUrl: openRouterBaseUrl, model: "openai/gpt-4.1-mini"};
  }
  if (answer === "3" || answer === "ollama") {
    return {baseUrl: ollamaBaseUrl, model: "auto"};
  }
  throw new Error("Choose an endpoint from 1 through 4");
}

function nextSteps(provider: ProviderName): string {
  if (provider === "codex") {
    return "Sign in with `codex login` if Codex is not already authenticated.";
  }
  if (provider === "copilot") {
    return "Adapter installed. Sign in with `bunx @github/copilot` and /login.";
  }
  if (provider === "claude") {
    return "Adapter installed. Sign in with `claude` and /login.";
  }
  if (provider === "openai") {
    return "Set OPENAI_API_KEY when the endpoint requires authentication.";
  }
  return "Automatic mode installs nothing; it uses the first adapter you already installed and authenticated.";
}

const providerLabels = {
  codex: "Codex",
  copilot: "GitHub Copilot",
  claude: "Claude Code"
} as const;

export function authenticatedMessage(
  providers: Array<keyof typeof providerLabels>
): string | undefined {
  if (providers.length === 0) return undefined;
  const names = providers.map(provider => providerLabels[provider]);
  const found =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return (
    `Found authenticated ${found}.\n\n` +
    "Run `parterre run` to start a session."
  );
}

export async function runSetupWizard(): Promise<void> {
  await installBrowser();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(
      "Non-interactive shell: provider selection skipped.\n" +
        `Parterre defaults to automatic provider discovery. Run \`parterre setup\` later or edit ${getUserConfigPath()}.\n`
    );
    return;
  }

  process.stdout.write(
    "\nHow should Parterre connect to an agent?\n\n" +
      "  1. Codex                 (ChatGPT subscription or API key)\n" +
      "  2. GitHub Copilot        (Copilot subscription)\n" +
      "  3. Claude Code           (Claude subscription or API key)\n" +
      "  4. Hosted or local API   (OpenAI, OpenRouter, Ollama, or custom)\n" +
      "  5. Automatic             (discover adapters already installed)\n\n"
  );
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const answer = (await readline.question("Choice [1/2/3/4/5]: "))
      .trim()
      .toLowerCase();
    const provider = providerFrom(answer);
    const endpoint =
      provider === "openai" ? await chooseEndpoint(readline) : undefined;

    await installProviderAdapter(provider);
    writeUserConfig({provider, ...endpoint});
    const authenticated = await detectAuthenticatedProviders(
      provider === "auto" ? undefined : [provider]
    );
    process.stdout.write(
      `\nSaved ${provider}${endpoint ? ` (${endpoint.baseUrl}, ${endpoint.model})` : ""} to ${getUserConfigPath()}.\n\n` +
        `${authenticatedMessage(authenticated) ?? nextSteps(provider)}\n\n` +
        "Override per run with `parterre run --provider auto|codex|copilot|claude|openai [--base-url <url>]`.\n"
    );
  } finally {
    readline.close();
  }
}
