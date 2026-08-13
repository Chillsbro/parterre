import {runProcess} from "../../processes/index.js";
import {isPlaywrightSessionOpen} from "./isPlaywrightSessionOpen.js";

export async function closePlaywrightSession(options: {
  command: string;
  workspace: string;
  playwrightSession: string;
}): Promise<void> {
  const result = await runProcess(
    options.command,
    [`-s=${options.playwrightSession}`, "close"],
    {
      cwd: options.workspace,
      timeoutMs: 15_000
    }
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Unable to close Playwright session ${options.playwrightSession}: ${
        result.stderr.trim() || `exit ${result.exitCode}`
      }`
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if (!(await isPlaywrightSessionOpen(options))) return;
    } catch {
      // The successful close response is authoritative when the registry is
      // briefly unreadable during process teardown.
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error(
    `Playwright session ${options.playwrightSession} is still running`
  );
}
