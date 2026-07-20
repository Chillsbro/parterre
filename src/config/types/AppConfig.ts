export type ProviderName = "auto" | "codex" | "copilot" | "claude" | "openai";

export interface AppConfig {
  provider: ProviderName;
  workspace: string;
  model: string;
  storageDir: string;
  playwrightCommand: string;
  redactions: string[];
  baseUrl?: string | undefined;
}

export type CliCommand =
  | {name: "run"; config: AppConfig}
  | {name: "sessions"; storageDir: string}
  | {name: "replay"; storageDir: string; sessionId: string}
  | {name: "delete"; storageDir: string; sessionId: string}
  | {name: "setup"}
  | {name: "help"};
