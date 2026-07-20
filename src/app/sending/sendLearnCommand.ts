import {buildLearnPrompt} from "../../commands/index.js";
import type {RuntimeController} from "../../runtime/index.js";

export async function sendLearnCommand(
  runtime: RuntimeController,
  rest: string[],
  workspace: string
): Promise<void> {
  const refresh = rest[0]?.toLowerCase() === "refresh";
  const target = (refresh ? rest.slice(1) : rest).join(" ").trim();
  const root = runtime.authorizeCodebaseRoot(target || workspace);
  if (refresh) await runtime.clearCodebaseProfile(root);
  await runtime.sendUserMessage(
    buildLearnPrompt(root),
    false,
    `/learn${refresh ? " refresh" : ""} ${root}`
  );
}
