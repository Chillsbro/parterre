import {
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile
} from "node:fs/promises";
import {dirname, extname, isAbsolute, resolve, sep} from "node:path";

const maxCommandOutputBytes = 64 * 1024;
const maxTestContentBytes = 1024 * 1024;
const testCommandTimeoutMs = 5 * 60 * 1000;
const testSourceExtensions = new Set([
  ".bash",
  ".c",
  ".cc",
  ".cjs",
  ".clj",
  ".cljs",
  ".cpp",
  ".cs",
  ".erl",
  ".ex",
  ".exs",
  ".fs",
  ".go",
  ".h",
  ".hpp",
  ".hrl",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
  ".zsh"
]);

export interface MaterializeTestRequest {
  path: string;
  content: string;
  sourceAssertionIds?: string[];
}

export type MaterializeTestResult =
  | {
      ok: true;
      passed: boolean;
      path: string;
      command: string[];
      exitCode: number;
      timedOut: boolean;
      stdout: string;
      stderr: string;
      sourceAssertionIds?: string[];
    }
  | {ok: false; error: string; path?: string};

export interface TargetRepository {
  materializeTest(
    request: MaterializeTestRequest
  ): Promise<MaterializeTestResult>;
}

function isInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

function isTestPath(path: string): boolean {
  const segments = path.split(/[\\/]/).filter(Boolean);
  const filename = segments.at(-1) ?? "";
  const testDirectory = segments
    .slice(0, -1)
    .some(segment => /^(?:tests?|specs?|e2e|__tests__)$/i.test(segment));
  const testFilename =
    /(?:^test_|_test\.|\.(?:test|spec)\.)/i.test(filename) ||
    /\.feature$/i.test(filename);
  const isFeature = /\.feature$/i.test(filename);
  const sourceExtension = testSourceExtensions.has(
    extname(filename).toLowerCase()
  );
  return isFeature || (sourceExtension && (testDirectory || testFilename));
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await stat(path, {throwIfNoEntry: false}));
}

async function nodeExists(path: string): Promise<boolean> {
  return Boolean(await lstat(path, {throwIfNoEntry: false}));
}

async function resolveWritablePath(
  root: string,
  requested: string
): Promise<{ok: true; path: string} | {ok: false; error: string}> {
  const trimmed = requested.trim();
  if (!trimmed || isAbsolute(trimmed)) {
    return {ok: false, error: "Test path must be relative to the target repo"};
  }
  if (!isTestPath(trimmed)) {
    return {
      ok: false,
      error: `Target path does not look like an automation test: ${trimmed}`
    };
  }
  const candidate = resolve(root, trimmed);
  if (!isInside(candidate, root)) {
    return {
      ok: false,
      error: `Test path escapes the target repo: ${candidate}`
    };
  }

  let existingAncestor = candidate;
  while (!(await nodeExists(existingAncestor))) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const [realRoot, realAncestor] = await Promise.all([
    realpath(root),
    realpath(existingAncestor)
  ]);
  if (!isInside(realAncestor, realRoot)) {
    return {
      ok: false,
      error: `Test path escapes the target repo through a symbolic link: ${candidate}`
    };
  }
  return {ok: true, path: candidate};
}

async function readJson(
  path: string
): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

async function discoverPackageTest(
  root: string
): Promise<string[] | undefined> {
  const manifest = await readJson(resolve(root, "package.json"));
  const scripts = manifest?.scripts;
  if (!scripts || typeof scripts !== "object") return undefined;
  const scriptEntries = scripts as Record<string, unknown>;
  const script = ["test:e2e", "e2e", "test"].find(
    candidate => typeof scriptEntries[candidate] === "string"
  );
  if (!script) return undefined;
  const packageManager =
    typeof manifest?.packageManager === "string" ? manifest.packageManager : "";
  if (packageManager.startsWith("bun@")) return ["bun", "run", script];
  if (packageManager.startsWith("pnpm@")) return ["pnpm", "run", script];
  if (packageManager.startsWith("yarn@")) return ["yarn", "run", script];
  if (packageManager.startsWith("npm@")) return ["npm", "run", script];
  if (
    (await exists(resolve(root, "bun.lock"))) ||
    (await exists(resolve(root, "bun.lockb")))
  ) {
    return ["bun", "run", script];
  }
  if (await exists(resolve(root, "pnpm-lock.yaml"))) {
    return ["pnpm", "run", script];
  }
  if (await exists(resolve(root, "yarn.lock"))) {
    return ["yarn", "run", script];
  }
  return ["npm", "run", script];
}

async function hasNamedTask(path: string, task: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf8");
    return new RegExp(`^${task}\\s*:`, "m").test(content);
  } catch {
    return false;
  }
}

async function discoverTestCommand(
  root: string
): Promise<string[] | undefined> {
  const packageCommand = await discoverPackageTest(root);
  if (packageCommand) return packageCommand;

  const deno = await readJson(resolve(root, "deno.json"));
  const denoTasks = deno?.tasks;
  if (denoTasks && typeof denoTasks === "object") {
    const tasks = denoTasks as Record<string, unknown>;
    const task = ["test:e2e", "e2e", "test"].find(
      candidate => typeof tasks[candidate] === "string"
    );
    if (task) return ["deno", "task", task];
  }
  if (await exists(resolve(root, "Cargo.toml"))) return ["cargo", "test"];
  if (await exists(resolve(root, "go.mod"))) return ["go", "test", "./..."];
  if (
    (await exists(resolve(root, "pyproject.toml"))) ||
    (await exists(resolve(root, "pytest.ini")))
  ) {
    return (await exists(resolve(root, "uv.lock")))
      ? ["uv", "run", "pytest"]
      : ["python", "-m", "pytest"];
  }
  if (await exists(resolve(root, "gradlew"))) return ["./gradlew", "test"];
  if (await exists(resolve(root, "pom.xml"))) return ["mvn", "test"];
  for (const filename of ["Makefile", "makefile"]) {
    for (const task of ["test-e2e", "e2e", "test"]) {
      if (await hasNamedTask(resolve(root, filename), task)) {
        return ["make", task];
      }
    }
  }
  for (const filename of ["justfile", "Justfile"]) {
    for (const task of ["test-e2e", "e2e", "test"]) {
      if (await hasNamedTask(resolve(root, filename), task)) {
        return ["just", task];
      }
    }
  }
  return undefined;
}

function limitOutput(output: string): string {
  if (Buffer.byteLength(output) <= maxCommandOutputBytes) return output;
  return `[truncated to final ${maxCommandOutputBytes} bytes]\n${Buffer.from(
    output
  )
    .subarray(-maxCommandOutputBytes)
    .toString("utf8")}`;
}

async function run(command: string[], root: string) {
  const child = Bun.spawn({
    cmd: command,
    cwd: root,
    env: {...Bun.env},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe"
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, testCommandTimeoutMs);
  const [stdout, rawStderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ]).finally(() => clearTimeout(timeout));
  const stderr = timedOut
    ? `${rawStderr}\nTest command timed out after ${testCommandTimeoutMs}ms.`
    : rawStderr;
  return {
    exitCode,
    timedOut,
    stdout: limitOutput(stdout),
    stderr: limitOutput(stderr)
  };
}

export function createTargetRepository(rootPath: string): TargetRepository {
  const root = resolve(rootPath);
  const sessionOwnedPaths = new Set<string>();

  return {
    async materializeTest(request) {
      let path: string | undefined;
      try {
        if (
          !request.content ||
          Buffer.byteLength(request.content) > maxTestContentBytes
        ) {
          return {
            ok: false,
            error: `Test content must contain 1-${maxTestContentBytes} bytes`
          };
        }
        const resolved = await resolveWritablePath(root, request.path);
        if (!resolved.ok) return resolved;
        path = resolved.path;
        const command = await discoverTestCommand(root);
        if (!command) {
          return {
            ok: false,
            error: `No supported test command was found in target repo: ${root}`
          };
        }
        const existingNode = await lstat(path, {throwIfNoEntry: false});
        if (existingNode && !sessionOwnedPaths.has(path)) {
          return {
            ok: false,
            error: `Refusing to replace a pre-existing target test: ${path}`,
            path
          };
        }
        if (existingNode?.isSymbolicLink()) {
          return {
            ok: false,
            error: `Refusing to write a target test through a symbolic link: ${path}`,
            path
          };
        }

        await mkdir(dirname(path), {recursive: true});
        await writeFile(path, request.content, {
          encoding: "utf8",
          flag: sessionOwnedPaths.has(path) ? "w" : "wx"
        });
        sessionOwnedPaths.add(path);
        const result = await run(command, root);
        return {
          ok: true,
          passed: result.exitCode === 0 && !result.timedOut,
          path,
          command,
          sourceAssertionIds: request.sourceAssertionIds ?? [],
          ...result
        };
      } catch (error) {
        const written = path ? sessionOwnedPaths.has(path) : false;
        return {
          ok: false,
          error: `${written ? "Test was written but its command could not run" : "Could not materialize target test"}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          ...(path ? {path} : {})
        };
      }
    }
  };
}
