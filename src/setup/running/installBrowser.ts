import {spawn} from "node:child_process";
import {resolvePackageExecutable} from "../../resolvePackageExecutable.js";

type RunInstall = (command: string, args: string[]) => Promise<number | null>;

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

export async function installBrowser(
  run: RunInstall = runInstall
): Promise<void> {
  process.stdout.write("Installing the browser…\n");
  const playwrightCommand = resolvePackageExecutable(
    "@playwright/cli",
    "playwright-cli.js"
  );
  const exitCode = await run(playwrightCommand, ["install-browser"]);
  if (exitCode !== 0) throw new Error("Could not install the browser");
}
