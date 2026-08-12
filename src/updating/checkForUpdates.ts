import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, parse, resolve} from "node:path";
import {createInterface} from "node:readline/promises";
import {pathToFileURL} from "node:url";
import packageMetadata from "../../package.json" with {type: "json"};

const latestReleaseUrl =
  "https://api.github.com/repos/Chillsbro/parterre/releases/latest";
const releaseArchiveUrl = (version: string): string =>
  `https://github.com/Chillsbro/parterre/releases/download/${version}/parterre.tar.gz`;

export interface InstalledRelease {
  version: string;
  installDir: string;
  binDir: string;
}

export interface ReleaseUpdate {
  version: string;
  archiveUrl: string;
  archiveSha256: string;
}

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type ProcessRunner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
) => Promise<number | null>;

interface UpdateOptions {
  installed?: InstalledRelease | undefined;
  interactive?: boolean | undefined;
  fetchLatest?: (() => Promise<ReleaseUpdate>) | undefined;
  confirm?: ((question: string) => Promise<boolean>) | undefined;
  install?:
    | ((installed: InstalledRelease, update: ReleaseUpdate) => Promise<void>)
    | undefined;
  restart?: (() => Promise<void>) | undefined;
  write?: ((message: string) => void) | undefined;
}

function parseReleaseVersion(
  version: string
): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareReleaseVersions(
  left: string,
  right: string
): -1 | 0 | 1 | undefined {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);
  if (!leftParts || !rightParts) return undefined;
  for (let index = 0; index < leftParts.length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

function ancestors(directory: string): string[] {
  const result: string[] = [];
  let current = resolve(directory);
  for (let depth = 0; depth < 4; depth += 1) {
    result.push(current);
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) break;
    current = parent;
  }
  return result;
}

export async function findInstalledRelease(
  startDirectories: string[] = [import.meta.dir, dirname(Bun.main)]
): Promise<InstalledRelease | undefined> {
  const candidates = [
    ...new Set(startDirectories.flatMap(directory => ancestors(directory)))
  ];
  for (const installDir of candidates) {
    try {
      const [version, binDir] = await Promise.all([
        readFile(join(installDir, "VERSION"), "utf8"),
        readFile(join(installDir, ".parterre-bin-dir"), "utf8")
      ]);
      const normalizedVersion = version.trim();
      const normalizedBinDir = binDir.trim();
      if (
        parseReleaseVersion(normalizedVersion) &&
        normalizedBinDir.length > 0
      ) {
        return {
          version: normalizedVersion,
          installDir,
          binDir: normalizedBinDir
        };
      }
    } catch {
      // Source checkouts and older unmanaged installations have no metadata.
    }
  }
  return undefined;
}

export async function getParterreVersion(
  startDirectories?: string[] | undefined
): Promise<string> {
  const installed = await findInstalledRelease(startDirectories);
  return installed?.version ?? `v${packageMetadata.version}`;
}

export async function fetchLatestRelease(
  fetchRelease: Fetcher = fetch
): Promise<ReleaseUpdate> {
  const response = await fetchRelease(latestReleaseUrl, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "parterre-updater"
    },
    signal: AbortSignal.timeout(3000)
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("tag_name" in payload) ||
    typeof payload.tag_name !== "string" ||
    !parseReleaseVersion(payload.tag_name) ||
    !("assets" in payload) ||
    !Array.isArray(payload.assets)
  ) {
    throw new Error("GitHub did not return a verified release archive");
  }

  const version = payload.tag_name;
  const expectedUrl = releaseArchiveUrl(version);
  const asset = payload.assets.find(
    candidate =>
      typeof candidate === "object" &&
      candidate !== null &&
      "name" in candidate &&
      candidate.name === "parterre.tar.gz" &&
      "browser_download_url" in candidate &&
      candidate.browser_download_url === expectedUrl
  );
  if (
    typeof asset !== "object" ||
    asset === null ||
    !("digest" in asset) ||
    typeof asset.digest !== "string"
  ) {
    throw new Error("GitHub did not return a verified release archive");
  }
  const digest = /^sha256:([a-f\d]{64})$/i.exec(asset.digest);
  if (!digest?.[1]) {
    throw new Error("GitHub did not return a verified release archive");
  }
  return {
    version,
    archiveUrl: expectedUrl,
    archiveSha256: digest[1].toLowerCase()
  };
}

async function confirmUpdate(question: string): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    return /^(?:y|yes)$/i.test((await readline.question(question)).trim());
  } finally {
    readline.close();
  }
}

async function waitForExit(command: string, args: string[], env = process.env) {
  const child = spawn(command, args, {env, stdio: "inherit"});
  return await new Promise<number | null>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", resolveExit);
  });
}

export async function installRelease(
  installed: InstalledRelease,
  update: ReleaseUpdate,
  fetchArchive: Fetcher = fetch,
  run: ProcessRunner = waitForExit
): Promise<void> {
  const installerPath = join(installed.installDir, "install.sh");
  await readFile(installerPath);
  const temporaryDir = await mkdtemp(join(tmpdir(), "parterre-update-"));
  const archivePath = join(temporaryDir, "parterre.tar.gz");
  try {
    const response = await fetchArchive(update.archiveUrl, {
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      throw new Error(`Could not download the update (${response.status})`);
    }
    const archive = new Uint8Array(await response.arrayBuffer());
    const actualSha256 = createHash("sha256").update(archive).digest("hex");
    if (actualSha256 !== update.archiveSha256.toLowerCase()) {
      throw new Error("The release archive integrity check failed");
    }
    await writeFile(archivePath, archive);
    const exitCode = await run("sh", [installerPath], {
      ...process.env,
      PARTERRE_VERSION: update.version,
      PARTERRE_ARCHIVE_URL: pathToFileURL(archivePath).href,
      PARTERRE_INSTALL_DIR: installed.installDir,
      PARTERRE_BIN_DIR: installed.binDir
    });
    if (exitCode !== 0) throw new Error("The Parterre installer failed");
  } finally {
    await rm(temporaryDir, {recursive: true, force: true});
  }
}

async function restartParterre(): Promise<void> {
  const exitCode = await waitForExit(process.execPath, [
    Bun.main,
    ...Bun.argv.slice(2)
  ]);
  process.exitCode = exitCode ?? 1;
}

export async function maybeUpdateParterre(
  options: UpdateOptions = {}
): Promise<boolean> {
  const interactive =
    options.interactive ??
    (process.stdin.isTTY === true && process.stdout.isTTY === true);
  if (!interactive) return false;
  const installed = options.installed ?? (await findInstalledRelease());
  if (!installed) return false;

  let latestRelease: ReleaseUpdate;
  try {
    latestRelease = await (options.fetchLatest ?? fetchLatestRelease)();
  } catch {
    return false;
  }
  if (compareReleaseVersions(latestRelease.version, installed.version) !== 1) {
    return false;
  }

  const write = options.write ?? (message => process.stdout.write(message));
  write(
    `\nParterre ${latestRelease.version} is available (installed ${installed.version}).\n`
  );
  let accepted: boolean;
  try {
    accepted = await (options.confirm ?? confirmUpdate)("Update now? [y/N] ");
  } catch {
    return false;
  }
  if (!accepted) return false;

  try {
    await (options.install ?? installRelease)(installed, latestRelease);
  } catch (error) {
    write(
      `Parterre could not update: ${error instanceof Error ? error.message : String(error)}\nContinuing with ${installed.version}.\n`
    );
    return false;
  }

  write(`Parterre updated to ${latestRelease.version}. Restarting…\n`);
  try {
    await (options.restart ?? restartParterre)();
  } catch (error) {
    write(
      `Parterre was updated, but could not restart: ${error instanceof Error ? error.message : String(error)}\nRun parterre again to continue.\n`
    );
  }
  return true;
}
