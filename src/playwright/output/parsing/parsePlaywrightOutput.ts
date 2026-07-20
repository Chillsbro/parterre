import {resolve, sep} from "node:path";
import type {ParsedPlaywrightOutput} from "../types/index.js";

export function parsePlaywrightOutput(
  output: string,
  workspace: string
): ParsedPlaywrightOutput {
  const url = /(?:Page URL|URL):\s*(.+)$/im.exec(output)?.[1]?.trim();
  const title = /(?:Page Title|Title):\s*(.+)$/im.exec(output)?.[1]?.trim();
  const root = resolve(workspace);
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  const artifacts = [
    ...output.matchAll(/\]\(([^)]+\.(?:png|ya?ml|zip|webm|pdf))\)/gi)
  ].flatMap(match => {
    if (!match[1]) return [];
    const artifactPath = resolve(root, match[1]);
    return artifactPath.startsWith(rootPrefix) ? [artifactPath] : [];
  });
  return {
    ...(url ? {url} : {}),
    ...(title ? {title} : {}),
    artifacts
  };
}
