import {readdir} from "node:fs/promises";
import {dirname, extname, join, parse} from "node:path";

export async function getRecordedVideoArtifactPaths(
  recordingPath: string
): Promise<string[]> {
  const recording = parse(recordingPath);
  if (extname(recording.base).toLowerCase() !== ".webm") return [];

  const entries = await readdir(dirname(recordingPath), {withFileTypes: true});
  return entries
    .flatMap(entry => {
      const isRecordedVideo =
        entry.isFile() &&
        extname(entry.name).toLowerCase() === ".webm" &&
        (entry.name === recording.base ||
          entry.name.startsWith(`${recording.name}-`));
      return isRecordedVideo ? [join(dirname(recordingPath), entry.name)] : [];
    })
    .sort((left, right) => {
      if (left === recordingPath) return -1;
      if (right === recordingPath) return 1;
      return left.localeCompare(right);
    });
}
