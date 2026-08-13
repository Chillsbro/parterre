import {
  type AppConfig,
  appConfigSchema,
  type ProviderName
} from "../../config/index.js";
import {
  type SessionMetadata,
  verifyRedactionVerifiers
} from "../../sessions/index.js";

const providers = new Set<ProviderName>([
  "auto",
  "codex",
  "copilot",
  "claude",
  "openai"
]);

export function resolveResumeConfig(options: {
  metadata: SessionMetadata;
  model: string;
  storageDir: string;
  playwrightCommand: string;
  redactions: string[];
  baseUrl?: string | undefined;
  allowUnverifiedRedactions?: boolean | undefined;
}): AppConfig {
  const {metadata} = options;
  if (!providers.has(metadata.agent as ProviderName)) {
    throw new Error(
      `Session ${metadata.id} uses unsupported provider ${metadata.agent}`
    );
  }
  if (
    metadata.baseUrl &&
    options.baseUrl &&
    metadata.baseUrl !== options.baseUrl
  ) {
    throw new Error(
      `Session ${metadata.id} is bound to ${metadata.baseUrl}; refusing endpoint override ${options.baseUrl}`
    );
  }
  if (!metadata.redactionVerifiers && !options.allowUnverifiedRedactions) {
    throw new Error(
      `Session ${metadata.id} predates verifiable redaction policies; review its history and pass --allow-unverified-redactions to resume explicitly`
    );
  }
  const redactionsMatch = metadata.redactionVerifiers
    ? verifyRedactionVerifiers(metadata.redactionVerifiers, options.redactions)
    : true;
  if (!redactionsMatch) {
    throw new Error(
      `Session ${metadata.id} requires its original redaction values, in their original order, before any additional --redact values`
    );
  }
  return appConfigSchema.parse({
    provider: metadata.agent,
    workspace: metadata.workspace,
    model: options.model,
    storageDir: options.storageDir,
    playwrightCommand: options.playwrightCommand,
    redactions: options.redactions,
    baseUrl: metadata.baseUrl ?? options.baseUrl,
    allowUnverifiedRedactions: options.allowUnverifiedRedactions
  });
}
