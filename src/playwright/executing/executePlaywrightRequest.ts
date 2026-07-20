import {copyFile, mkdir, writeFile} from "node:fs/promises";
import {basename, dirname} from "node:path";
import {runProcess} from "../../processes/index.js";
import {
  getArtifactPath,
  getLogPath,
  type PlaywrightResult
} from "../../sessions/index.js";
import {getArtifactKind, getRequestedArtifactPath} from "../artifacts/index.js";
import {getBrowserCommandDescriptor} from "../commands/index.js";
import {writeBrowserCompatibilityConfig} from "../configuring/index.js";
import {parsePlaywrightOutput} from "../output/index.js";
import type {PlaywrightRequest} from "../types/index.js";
import {sanitizePlaywrightArgs} from "./sanitizePlaywrightArgs.js";

export async function executePlaywrightRequest(options: {
  command: string;
  workspace: string;
  playwrightSession: string;
  storageDir: string;
  sessionId: string;
  request: PlaywrightRequest;
}): Promise<PlaywrightResult> {
  const {request} = options;
  if (!getBrowserCommandDescriptor(request.command)) {
    throw new Error(`Unsupported Playwright command: ${request.command}`);
  }

  const commandArgs = sanitizePlaywrightArgs(request.args);
  const browserConfigPath =
    request.command === "open"
      ? await writeBrowserCompatibilityConfig({
          storageDir: options.storageDir,
          sessionId: options.sessionId
        })
      : undefined;
  const requestedArtifactPath = getRequestedArtifactPath(
    options.storageDir,
    options.sessionId,
    request
  );
  if (requestedArtifactPath)
    commandArgs.push(`--filename=${requestedArtifactPath}`);

  const processResult = await runProcess(
    options.command,
    [
      `-s=${options.playwrightSession}`,
      request.command,
      ...(browserConfigPath ? [`--config=${browserConfigPath}`] : []),
      ...commandArgs
    ],
    {
      cwd: options.workspace,
      env: {PLAYWRIGHT_MCP_HEADLESS: "true"}
    }
  );
  const output = [processResult.stdout, processResult.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();
  const parsedOutput = parsePlaywrightOutput(output, options.workspace);
  const sourceArtifacts = new Set(parsedOutput.artifacts);
  if (
    requestedArtifactPath &&
    (await Bun.file(requestedArtifactPath).exists())
  ) {
    sourceArtifacts.add(requestedArtifactPath);
  }

  const storedArtifacts: string[] = [];
  for (const sourcePath of sourceArtifacts) {
    const artifactKind = getArtifactKind(sourcePath);
    const destinationPath = getArtifactPath(
      options.storageDir,
      options.sessionId,
      artifactKind,
      basename(sourcePath)
    );
    await mkdir(dirname(destinationPath), {recursive: true});
    if (sourcePath !== destinationPath)
      await copyFile(sourcePath, destinationPath);
    storedArtifacts.push(destinationPath);
  }

  const logPrefix = `${Date.now()}-${request.id}`;
  await Promise.all([
    writeFile(
      getLogPath(
        options.storageDir,
        options.sessionId,
        `${logPrefix}.stdout.log`
      ),
      processResult.stdout
    ),
    writeFile(
      getLogPath(
        options.storageDir,
        options.sessionId,
        `${logPrefix}.stderr.log`
      ),
      processResult.stderr
    )
  ]);

  return {
    request,
    ok: processResult.exitCode === 0,
    output,
    ...(processResult.exitCode === 0
      ? {}
      : {error: `playwright-cli exited with ${processResult.exitCode}`}),
    artifacts: storedArtifacts,
    durationMs: processResult.durationMs,
    ...(parsedOutput.url ? {url: parsedOutput.url} : {}),
    ...(parsedOutput.title ? {title: parsedOutput.title} : {})
  };
}
