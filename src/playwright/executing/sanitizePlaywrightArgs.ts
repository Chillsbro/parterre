import type {PlaywrightArgument} from "../types/index.js";

export function sanitizePlaywrightArgs(args: PlaywrightArgument[]): string[] {
  return args
    .map(value => String(value))
    .filter(
      value =>
        value !== "--headed" &&
        value !== "--headless" &&
        !value.startsWith("--config") &&
        !value.startsWith("--filename")
    );
}
