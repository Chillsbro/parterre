import {resolvePackageExecutable} from "../../resolvePackageExecutable.js";

export function getDefaultPlaywrightCommand(): string {
  return resolvePackageExecutable("@playwright/cli", "playwright-cli.js");
}
