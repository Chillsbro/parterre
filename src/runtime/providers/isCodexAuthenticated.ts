import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {resolveAdapterModule} from "./adapterModules.js";

const execFileAsync = promisify(execFile);

export async function isCodexAuthenticated(): Promise<boolean> {
  try {
    const cli = resolveAdapterModule("@openai/codex/bin/codex.js");
    await execFileAsync(process.execPath, [cli, "login", "status"], {
      timeout: 10_000,
      maxBuffer: 64 * 1024
    });
    return true;
  } catch {
    return false;
  }
}
