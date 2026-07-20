import {homedir} from "node:os";
import {join, resolve} from "node:path";
import {parseArgs} from "node:util";
import {appConfigSchema} from "../schemas/index.js";
import type {CliCommand} from "../types/index.js";
import {getDefaultPlaywrightCommand} from "./getDefaultPlaywrightCommand.js";
import {readUserConfig} from "./readUserConfig.js";

export function loadCliCommand(argv: string[]): CliCommand {
  const [subcommand = "help", ...remainingArgs] = argv;
  const defaultStorageDir = join(homedir(), ".parterre", "sessions");

  if (subcommand === "setup") return {name: "setup"};

  if (subcommand === "sessions") {
    const {values} = parseArgs({
      args: remainingArgs,
      options: {storage: {type: "string"}},
      strict: true
    });
    return {
      name: "sessions",
      storageDir: resolve(values.storage ?? defaultStorageDir)
    };
  }

  if (subcommand === "replay" || subcommand === "delete") {
    const {values, positionals} = parseArgs({
      args: remainingArgs,
      allowPositionals: true,
      options: {storage: {type: "string"}},
      strict: true
    });
    const sessionId = positionals[0];
    if (!sessionId) throw new Error(`${subcommand} requires a session ID`);
    return {
      name: subcommand,
      sessionId,
      storageDir: resolve(values.storage ?? defaultStorageDir)
    };
  }

  if (subcommand !== "run") return {name: "help"};

  const {values} = parseArgs({
    args: remainingArgs,
    options: {
      provider: {type: "string"},
      model: {type: "string"},
      workspace: {type: "string"},
      storage: {type: "string"},
      playwright: {type: "string"},
      redact: {type: "string", multiple: true},
      "base-url": {type: "string"}
    },
    strict: true
  });

  const userConfig = readUserConfig();
  const provider = values.provider ?? userConfig.provider ?? "auto";
  const baseUrl =
    values["base-url"] ??
    userConfig.baseUrl ??
    (provider === "openai" ? "https://api.openai.com/v1" : undefined);
  const config = appConfigSchema.parse({
    provider,
    workspace: resolve(values.workspace ?? process.cwd()),
    model:
      values.model ??
      userConfig.model ??
      (baseUrl === "https://api.openai.com/v1" ? "gpt-4.1-mini" : "auto"),
    storageDir: resolve(values.storage ?? defaultStorageDir),
    playwrightCommand: values.playwright ?? getDefaultPlaywrightCommand(),
    redactions: values.redact ?? [],
    baseUrl
  });

  return {name: "run", config};
}
