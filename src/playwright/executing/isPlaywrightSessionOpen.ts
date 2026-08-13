import {runProcess} from "../../processes/index.js";

export async function isPlaywrightSessionOpen(options: {
  command: string;
  workspace: string;
  playwrightSession: string;
}): Promise<boolean> {
  let lastError = "Playwright CLI returned an invalid session list";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await runProcess(options.command, ["list", "--json"], {
      cwd: options.workspace,
      timeoutMs: 15_000
    });
    if (result.exitCode !== 0) {
      lastError = `Unable to list Playwright sessions: ${result.stderr.trim() || `exit ${result.exitCode}`}`;
    } else {
      try {
        const listing: unknown = JSON.parse(result.stdout);
        if (
          listing &&
          typeof listing === "object" &&
          "browsers" in listing &&
          Array.isArray(listing.browsers)
        ) {
          return listing.browsers.some(browser => {
            return (
              browser !== null &&
              typeof browser === "object" &&
              "name" in browser &&
              browser.name === options.playwrightSession
            );
          });
        }
      } catch {
        const output = result.stdout.trim();
        lastError = `Playwright CLI returned an invalid session list${
          output ? `: ${output.slice(0, 200)}` : " (empty output)"
        }`;
      }
    }
    if (attempt < 2) await Bun.sleep(100);
  }
  throw new Error(lastError);
}
