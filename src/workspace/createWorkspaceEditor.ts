import {createHash, randomUUID} from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {
  maxWorkspaceFileBytes,
  type WorkspaceEditor,
  type WorkspaceFileWriteRequest,
  type WorkspaceFileWriteResult,
  type WorkspaceWriteProposal
} from "./types.js";

interface MissingSnapshot {
  exists: false;
}

interface ExistingSnapshot {
  exists: true;
  dev: number;
  ino: number;
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  sha256: string;
}

type FileSnapshot = MissingSnapshot | ExistingSnapshot;

function failure(error: string, path?: string): WorkspaceFileWriteResult {
  return {ok: false, error, ...(path ? {path} : {})};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pathIsOutside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)
  );
}

function resolveTarget(
  root: string,
  requestedPath: string
): {path: string; relativePath: string} {
  const trimmed = requestedPath.trim();
  if (!trimmed) throw new Error("Workspace file path must not be empty");
  if (isAbsolute(trimmed)) {
    throw new Error("Workspace file path must be relative to the workspace");
  }
  const path = resolve(root, trimmed);
  if (path === root || pathIsOutside(root, path)) {
    throw new Error(`Workspace file path escapes the workspace: ${trimmed}`);
  }
  const fromRoot = relative(root, path);
  const segments = fromRoot.split(sep);
  if (segments.some(segment => segment.toLowerCase() === ".git")) {
    throw new Error("Writing Git metadata is not allowed");
  }
  return {path, relativePath: segments.join("/")};
}

function sameMetadata(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

async function snapshot(path: string): Promise<FileSnapshot> {
  const before = await lstat(path, {throwIfNoEntry: false});
  if (!before) return {exists: false};
  if (before.isSymbolicLink()) {
    throw new Error(`Refusing to write through a symbolic link: ${path}`);
  }
  if (!before.isFile()) throw new Error(`Not a regular file: ${path}`);
  if (before.size > maxWorkspaceFileBytes) {
    throw new Error(
      `Existing workspace file exceeds ${maxWorkspaceFileBytes} bytes: ${path}`
    );
  }
  const content = await readFile(path);
  const after = await lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    !sameMetadata(before, after)
  ) {
    throw new Error(`Workspace file changed while inspecting it: ${path}`);
  }
  return {
    exists: true,
    dev: after.dev,
    ino: after.ino,
    mode: after.mode,
    size: after.size,
    mtimeMs: after.mtimeMs,
    ctimeMs: after.ctimeMs,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function snapshotsMatch(left: FileSnapshot, right: FileSnapshot): boolean {
  if (left.exists !== right.exists) return false;
  if (!left.exists || !right.exists) return true;
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.sha256 === right.sha256
  );
}

async function assertSnapshotUnchanged(
  path: string,
  expected: FileSnapshot
): Promise<void> {
  let current: FileSnapshot;
  try {
    current = await snapshot(path);
  } catch {
    throw new Error(`Workspace file changed while awaiting approval: ${path}`);
  }
  if (!snapshotsMatch(current, expected)) {
    throw new Error(`Workspace file changed while awaiting approval: ${path}`);
  }
}

async function validateParentDirectories(options: {
  root: string;
  parent: string;
  createMissing: boolean;
}): Promise<void> {
  if (pathIsOutside(options.root, options.parent)) {
    throw new Error(
      `Workspace file parent escapes the workspace: ${options.parent}`
    );
  }
  const segments = relative(options.root, options.parent)
    .split(sep)
    .filter(Boolean);
  let current = options.root;
  for (const segment of segments) {
    current = join(current, segment);
    let stats = await lstat(current, {throwIfNoEntry: false});
    if (!stats && !options.createMissing) return;
    if (!stats) {
      await mkdir(current);
      stats = await lstat(current);
    }
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Refusing to write through a symbolic-link directory: ${current}`
      );
    }
    if (!stats.isDirectory()) {
      throw new Error(`Workspace file parent is not a directory: ${current}`);
    }
    const canonical = await realpath(current);
    if (pathIsOutside(options.root, canonical)) {
      throw new Error(
        `Workspace file parent escapes the workspace: ${current}`
      );
    }
  }
}

async function commitWrite(options: {
  root: string;
  path: string;
  content: Buffer;
  before: FileSnapshot;
}): Promise<void> {
  const parent = dirname(options.path);
  await validateParentDirectories({
    root: options.root,
    parent,
    createMissing: true
  });
  await assertSnapshotUnchanged(options.path, options.before);
  const temporary = join(parent, `.parterre-write-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, options.content, {
      flag: "wx",
      ...(options.before.exists ? {mode: options.before.mode & 0o777} : {})
    });
    await assertSnapshotUnchanged(options.path, options.before);
    if (options.before.exists) await rename(temporary, options.path);
    else await link(temporary, options.path);
  } finally {
    await rm(temporary, {force: true}).catch(() => {});
  }
}

export function createWorkspaceEditor(options: {
  root: string;
  approve(
    proposal: WorkspaceWriteProposal,
    signal?: AbortSignal
  ): Promise<boolean>;
}): WorkspaceEditor {
  const configuredRoot = resolve(options.root);
  let queue: Promise<void> = Promise.resolve();

  const performWrite = async (
    request: WorkspaceFileWriteRequest,
    signal?: AbortSignal
  ): Promise<WorkspaceFileWriteResult> => {
    if (signal?.aborted) return failure("Workspace file write interrupted");
    const content = Buffer.from(request.content, "utf8");
    if (content.byteLength > maxWorkspaceFileBytes) {
      return failure(
        `Workspace file content exceeds ${maxWorkspaceFileBytes} bytes`
      );
    }
    let path: string | undefined;
    try {
      const root = await realpath(configuredRoot);
      const rootStats = await lstat(root);
      if (!rootStats.isDirectory()) {
        return failure(`Workspace is not a directory: ${root}`);
      }
      const target = resolveTarget(root, request.path);
      path = target.path;
      await validateParentDirectories({
        root,
        parent: dirname(path),
        createMissing: false
      });
      const before = await snapshot(path);
      const contentSha256 = createHash("sha256").update(content).digest("hex");
      if (before.exists && before.sha256 === contentSha256) {
        await assertSnapshotUnchanged(path, before);
        return {
          ok: true,
          path,
          relativePath: target.relativePath,
          created: false,
          changed: false,
          bytes: content.byteLength
        };
      }
      const proposal: WorkspaceWriteProposal = {
        action: before.exists ? "replace" : "create",
        path,
        relativePath: target.relativePath,
        bytes: content.byteLength
      };
      if (!(await options.approve(proposal, signal))) {
        return failure("User denied workspace file write", path);
      }
      if (signal?.aborted) {
        return failure("Workspace file write interrupted", path);
      }
      await commitWrite({root, path, content, before});
      return {
        ok: true,
        path,
        relativePath: target.relativePath,
        created: !before.exists,
        changed: true,
        bytes: content.byteLength
      };
    } catch (error) {
      return failure(errorMessage(error), path);
    }
  };

  return {
    writeFile(request, writeOptions) {
      const result = queue.then(() =>
        performWrite(request, writeOptions?.signal)
      );
      queue = result.then(
        () => {},
        () => {}
      );
      return result;
    }
  };
}
