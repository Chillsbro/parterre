import {readFileSync} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";
import type {ProviderName} from "../types/index.js";

export interface UserConfig {
  provider?: ProviderName;
  baseUrl?: string;
  model?: string;
}

const providerNames = new Set<ProviderName>([
  "auto",
  "codex",
  "copilot",
  "claude",
  "openai"
]);

export function getUserConfigPath(): string {
  return join(homedir(), ".parterre", "config.json");
}

export function readUserConfig(configPath = getUserConfigPath()): UserConfig {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const {provider, baseUrl, model} = parsed as {
      provider?: unknown;
      baseUrl?: unknown;
      model?: unknown;
    };
    return {
      ...(providerNames.has(provider as ProviderName)
        ? {provider: provider as ProviderName}
        : {}),
      ...(typeof baseUrl === "string" && baseUrl ? {baseUrl} : {}),
      ...(typeof model === "string" && model ? {model} : {})
    };
  } catch {
    return {};
  }
}
