import {expect, test} from "bun:test";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

interface InstallerFixture {
  root: string;
  releaseDir: string;
  fakeBinDir: string;
  installDir: string;
  commandDir: string;
  archivePath: string;
  fakeBun: string;
}

async function createInstallerFixture(
  prefix: string
): Promise<InstallerFixture> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const fixture = {
    root,
    releaseDir: join(root, "release"),
    fakeBinDir: join(root, "fake-bin"),
    installDir: join(root, "installed"),
    commandDir: join(root, "commands"),
    archivePath: join(root, "parterre.tar.gz"),
    fakeBun: join(root, "fake-bin", "bun")
  };
  await mkdir(join(fixture.releaseDir, "bin"), {recursive: true});
  await mkdir(fixture.fakeBinDir, {recursive: true});
  await writeFile(join(fixture.releaseDir, "VERSION"), "v9.8.7\n");
  await writeFile(
    join(fixture.releaseDir, "package.json"),
    '{"name":"parterre"}'
  );
  await writeFile(join(fixture.releaseDir, "bun.lock"), "");
  await writeFile(join(fixture.releaseDir, "install.sh"), "#!/bin/sh\n");
  await writeFile(
    join(fixture.releaseDir, "bin", "parterre.js"),
    "#!/usr/bin/env bun\n"
  );
  await copyFile(
    resolve("bin/atomic-swap.js"),
    join(fixture.releaseDir, "bin", "atomic-swap.js")
  );
  return fixture;
}

async function writeFakeBun(
  fixture: InstallerFixture,
  smokeTestLines: string[] = [
    `if [ "\${2:-}" = "--v" ]; then`,
    '  cat "$(dirname "$1")/../VERSION"',
    "  exit 0",
    "fi"
  ],
  atomicSwapLines: string[] = ['exec "$REAL_BUN" "$@"']
): Promise<void> {
  await writeFile(
    fixture.fakeBun,
    [
      "#!/bin/sh",
      `if [ "\${1:-}" = "install" ]; then exit 0; fi`,
      `case "\${1:-}" in`,
      "  */atomic-swap.js)",
      ...atomicSwapLines.map(line => `    ${line}`),
      "    ;;",
      "esac",
      ...smokeTestLines,
      "exit 1",
      ""
    ].join("\n")
  );
  await chmod(fixture.fakeBun, 0o700);
}

async function archiveRelease(fixture: InstallerFixture): Promise<void> {
  const archive = Bun.spawn({
    cmd: ["tar", "-czf", fixture.archivePath, "-C", fixture.releaseDir, "."],
    stdout: "ignore",
    stderr: "pipe"
  });
  expect(await archive.exited).toBe(0);
}

async function runInstaller(
  fixture: InstallerFixture,
  options: {
    version?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  } = {}
): Promise<{exitCode: number; stderr: string}> {
  const install = Bun.spawn({
    cmd: ["sh", resolve("install.sh")],
    cwd: resolve("."),
    env: {
      ...process.env,
      HOME: fixture.root,
      PATH: `${fixture.fakeBinDir}:${process.env.PATH ?? ""}`,
      REAL_BUN: process.execPath,
      PARTERRE_ARCHIVE_URL: `file://${fixture.archivePath}`,
      PARTERRE_INSTALL_DIR: fixture.installDir,
      PARTERRE_BIN_DIR: fixture.commandDir,
      ...(options.version ? {PARTERRE_VERSION: options.version} : {}),
      ...options.env
    },
    stdout: "ignore",
    stderr: "pipe"
  });
  const stderr = await new Response(install.stderr).text();
  return {exitCode: await install.exited, stderr};
}

async function createPreviousInstall(fixture: InstallerFixture): Promise<void> {
  await mkdir(join(fixture.installDir, "bin"), {recursive: true});
  await writeFile(join(fixture.installDir, "VERSION"), "v1.0.0\n");
  await writeFile(join(fixture.installDir, "previous-marker"), "previous\n");
  await writeFile(
    join(fixture.installDir, "bin", "parterre.js"),
    "old release\n"
  );
}

async function expectPreviousInstall(fixture: InstallerFixture): Promise<void> {
  expect(await readFile(join(fixture.installDir, "VERSION"), "utf8")).toBe(
    "v1.0.0\n"
  );
  expect(
    await readFile(join(fixture.installDir, "previous-marker"), "utf8")
  ).toBe("previous\n");
}

test("installer delimits variables before non-ASCII text", async () => {
  const installer = await readFile(resolve("install.sh"), "utf8");

  expect(installer).not.toMatch(/\$[A-Za-z_][A-Za-z0-9_]*\P{ASCII}/u);
});

test("atomic swap exchanges two directories without an absent-path window", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-atomic-swap-"));
  const left = join(root, "left");
  const right = join(root, "right");
  await mkdir(left);
  await mkdir(right);
  await writeFile(join(left, "marker"), "left\n");
  await writeFile(join(right, "marker"), "right\n");
  try {
    const swap = Bun.spawn({
      cmd: [process.execPath, resolve("bin/atomic-swap.js"), left, right],
      stdout: "ignore",
      stderr: "pipe"
    });
    expect(await swap.exited).toBe(0);
    expect(await readFile(join(left, "marker"), "utf8")).toBe("right\n");
    expect(await readFile(join(right, "marker"), "utf8")).toBe("left\n");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("installer records release metadata used by automatic updates", async () => {
  const fixture = await createInstallerFixture("parterre-installer-");
  await writeFakeBun(fixture);
  try {
    await archiveRelease(fixture);
    expect((await runInstaller(fixture)).exitCode).toBe(0);
    expect(await readFile(join(fixture.installDir, "VERSION"), "utf8")).toBe(
      "v9.8.7\n"
    );
    expect(
      await readFile(join(fixture.installDir, ".parterre-bin-dir"), "utf8")
    ).toBe(`${fixture.commandDir}\n`);
    expect(await readFile(join(fixture.installDir, "install.sh"), "utf8")).toBe(
      "#!/bin/sh\n"
    );
    expect(await Bun.file(join(fixture.commandDir, "parterre")).exists()).toBe(
      true
    );
  } finally {
    await rm(fixture.root, {recursive: true, force: true});
  }
});

test("installer rolls back when the applied release fails its smoke test", async () => {
  const fixture = await createInstallerFixture("parterre-rollback-");
  const smokeCountPath = join(fixture.root, "smoke-count");
  await createPreviousInstall(fixture);
  await writeFakeBun(fixture, [
    'count=$(cat "$SMOKE_COUNT_FILE" 2>/dev/null || printf 0)',
    "count=$((count + 1))",
    'printf "%s\\n" "$count" > "$SMOKE_COUNT_FILE"',
    'if [ "$count" -eq 1 ]; then',
    '  cat "$(dirname "$1")/../VERSION"',
    "  exit 0",
    "fi"
  ]);
  try {
    await archiveRelease(fixture);
    const result = await runInstaller(fixture, {
      version: "v9.8.7",
      env: {SMOKE_COUNT_FILE: smokeCountPath}
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(
      "restored the previous Parterre installation"
    );
    await expectPreviousInstall(fixture);
  } finally {
    await rm(fixture.root, {recursive: true, force: true});
  }
});

test("installer rolls back when interrupted immediately after the atomic swap", async () => {
  const fixture = await createInstallerFixture("parterre-signal-rollback-");
  const signalSentPath = join(fixture.root, "signal-sent");
  await createPreviousInstall(fixture);
  await writeFakeBun(fixture, undefined, [
    '"$REAL_BUN" "$@"',
    "result=$?",
    'if [ "$result" -eq 0 ] && [ ! -e "$SIGNAL_SENT_FILE" ]; then',
    '  : > "$SIGNAL_SENT_FILE"',
    '  kill -TERM "$PPID"',
    "fi",
    'exit "$result"'
  ]);
  try {
    await archiveRelease(fixture);
    const result = await runInstaller(fixture, {
      version: "v9.8.7",
      env: {SIGNAL_SENT_FILE: signalSentPath}
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(
      "restored the previous Parterre installation"
    );
    await expectPreviousInstall(fixture);
  } finally {
    await rm(fixture.root, {recursive: true, force: true});
  }
});

test("installer refuses an update that fails the disk preflight", async () => {
  const fixture = await createInstallerFixture("parterre-disk-preflight-");
  const bunCalledPath = join(fixture.root, "bun-called");
  await mkdir(fixture.installDir, {recursive: true});
  await writeFile(join(fixture.installDir, "previous-marker"), "previous\n");
  await writeFile(
    fixture.fakeBun,
    '#!/bin/sh\nprintf called > "$BUN_CALLED_FILE"\nexit 1\n'
  );
  await writeFile(
    join(fixture.fakeBinDir, "df"),
    "#!/bin/sh\nprintf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on' 'fake 100 99 1 99% /'\n"
  );
  await chmod(fixture.fakeBun, 0o700);
  await chmod(join(fixture.fakeBinDir, "df"), 0o700);
  try {
    await archiveRelease(fixture);
    const result = await runInstaller(fixture, {
      version: "v9.8.7",
      env: {BUN_CALLED_FILE: bunCalledPath}
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Not enough disk space");
    expect(await Bun.file(bunCalledPath).exists()).toBe(false);
    expect(
      await readFile(join(fixture.installDir, "previous-marker"), "utf8")
    ).toBe("previous\n");
  } finally {
    await rm(fixture.root, {recursive: true, force: true});
  }
});
