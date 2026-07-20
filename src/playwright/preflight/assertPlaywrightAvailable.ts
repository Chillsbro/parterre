import {isAbsolute} from "node:path";

export async function assertPlaywrightAvailable(
  command: string
): Promise<void> {
  if (!command.includes("/") && !isAbsolute(command)) return;
  if (await Bun.file(command).exists()) return;
  throw new Error(
    `Playwright CLI not found at ${command}.\n` +
      "Run `parterre setup` to install it, or point Parterre at an existing binary with `parterre run --playwright <path>`."
  );
}
