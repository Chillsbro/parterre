import {expect, test} from "bun:test";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  getManagedVideoStartArgs,
  getRecordedVideoArtifactPaths,
  getRequestedArtifactPath
} from "../../../src/playwright/index.js";

test("reserves a managed WebM path when recording begins", () => {
  const path = getRequestedArtifactPath("/storage", "session-1", {
    id: "recording-1",
    command: "video-start",
    args: []
  });
  expect(path).toStartWith("/storage/session-1/artifacts/videos/");
  expect(path).toEndWith("-recording-1.webm");
});

test("collects every WebM produced for a managed recording", async () => {
  const directory = await mkdtemp(join(tmpdir(), "parterre-videos-"));
  try {
    const recordingPath = join(directory, "recording.webm");
    await Promise.all([
      writeFile(recordingPath, "one"),
      writeFile(join(directory, "recording-1.webm"), "two"),
      writeFile(join(directory, "unrelated.webm"), "three"),
      writeFile(join(directory, "recording.txt"), "four")
    ]);

    expect(await getRecordedVideoArtifactPaths(recordingPath)).toEqual([
      recordingPath,
      join(directory, "recording-1.webm")
    ]);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test("owns the video output filename while preserving the size option", () => {
  expect(
    getManagedVideoStartArgs(
      ["untrusted.webm", "--size", "1280x720"],
      "/storage/session/videos/managed.webm"
    )
  ).toEqual(["/storage/session/videos/managed.webm", "--size", "1280x720"]);
});
