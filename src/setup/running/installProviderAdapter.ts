import {spawn} from "node:child_process";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import type {ProviderName} from "../../config/index.js";
import {getAdapterRoot} from "../../runtime/providers/adapterModules.js";

type InstallAdapter = (
  root: string,
  packages: string[]
) => Promise<number | null>;

const adapterPackages: Partial<Record<ProviderName, string[]>> = {
  codex: [
    "@openai/codex-sdk@^0.144.6",
    "@openai/codex@^0.144.6",
    "@modelcontextprotocol/sdk@^1.29.0"
  ],
  copilot: ["@github/copilot-sdk@^1.0.6"],
  claude: ["@anthropic-ai/claude-agent-sdk@^0.3.207"]
};

async function runInstall(
  command: string,
  args: string[]
): Promise<number | null> {
  const child = spawn(command, args, {stdio: "inherit"});
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
}

async function prepareAdapterRoot(root: string): Promise<void> {
  await mkdir(root, {recursive: true});
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({private: true}, null, 2)}\n`,
    {flag: "wx"}
  ).catch(error => {
    if (
      !(error instanceof Error && "code" in error && error.code === "EEXIST")
    ) {
      throw error;
    }
  });
}

async function installAdapter(
  root: string,
  packages: string[]
): Promise<number | null> {
  await prepareAdapterRoot(root);
  return runInstall(process.execPath, [
    "add",
    "--omit",
    "peer",
    "--cwd",
    root,
    ...packages
  ]);
}

export async function installProviderAdapter(
  provider: ProviderName,
  install: InstallAdapter = installAdapter
): Promise<void> {
  const packages = adapterPackages[provider];
  if (!packages) return;

  process.stdout.write(`\nInstalling the ${provider} adapter…\n`);
  const exitCode = await install(getAdapterRoot(), packages);
  if (exitCode !== 0) {
    throw new Error(`Could not install the ${provider} adapter`);
  }
}
