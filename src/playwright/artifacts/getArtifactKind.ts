import {extname} from "node:path";

export function getArtifactKind(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "screenshots";
  if (extension === ".zip") return "traces";
  if (extension === ".webm") return "videos";
  return "snapshots";
}
