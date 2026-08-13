import type {PlaywrightArgument} from "../types/index.js";

export function sanitizePlaywrightArgs(args: PlaywrightArgument[]): string[] {
  const values = args.map(value => String(value));
  const sanitized: string[] = [];
  const valueFlags = new Set([
    "--session",
    "-s",
    "--config",
    "--filename",
    "--profile",
    "--cdp",
    "--endpoint",
    "--extension"
  ]);
  const standaloneFlags = new Set([
    "--headed",
    "--headless",
    "--persistent",
    "--json",
    "--raw",
    "--help",
    "-h",
    "--version",
    "-v"
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? "";
    if (standaloneFlags.has(value)) continue;
    if (valueFlags.has(value)) {
      index += 1;
      continue;
    }
    if ([...valueFlags].some(flag => value.startsWith(`${flag}=`))) continue;
    sanitized.push(value);
  }
  return sanitized;
}
