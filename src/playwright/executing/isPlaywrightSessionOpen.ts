import {runProcess} from "../../processes/index.js";

export async function isPlaywrightSessionOpen(options: {
  command: string;
  workspace: string;
  playwrightSession: string;
}): Promise<boolean> {
  const result = await runProcess(options.command, ["list", "--json"], {
    cwd: options.workspace,
    timeoutMs: 15_000
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Unable to list Playwright sessions: ${result.stderr.trim() || `exit ${result.exitCode}`}`
    );
  }

  const listing: unknown = JSON.parse(result.stdout);
  if (
    !listing ||
    typeof listing !== "object" ||
    !("browsers" in listing) ||
    !Array.isArray(listing.browsers)
  ) {
    throw new Error("Playwright CLI returned an invalid session list");
  }
  return listing.browsers.some(browser => {
    return (
      browser !== null &&
      typeof browser === "object" &&
      "name" in browser &&
      browser.name === options.playwrightSession
    );
  });
}
