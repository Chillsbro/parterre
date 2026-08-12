import {expect, test} from "bun:test";
import {chmod, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

test("installer delimits variables before non-ASCII text", async () => {
  const installer = await readFile(resolve("install.sh"), "utf8");

  expect(installer).not.toMatch(/\$[A-Za-z_][A-Za-z0-9_]*\P{ASCII}/u);
});

test("installer records release metadata used by automatic updates", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-installer-"));
  const releaseDir = join(root, "release");
  const fakeBinDir = join(root, "fake-bin");
  const installDir = join(root, "installed");
  const commandDir = join(root, "commands");
  const archivePath = join(root, "parterre.tar.gz");
  await mkdir(join(releaseDir, "bin"), {recursive: true});
  await mkdir(fakeBinDir, {recursive: true});
  await writeFile(join(releaseDir, "VERSION"), "v9.8.7\n");
  await writeFile(join(releaseDir, "package.json"), '{"name":"parterre"}');
  await writeFile(join(releaseDir, "bun.lock"), "");
  await writeFile(join(releaseDir, "install.sh"), "#!/bin/sh\n");
  await writeFile(
    join(releaseDir, "bin", "parterre.js"),
    "#!/usr/bin/env bun\n"
  );
  const fakeBun = join(fakeBinDir, "bun");
  await writeFile(fakeBun, "#!/bin/sh\nexit 0\n");
  await chmod(fakeBun, 0o700);

  try {
    const archive = Bun.spawn({
      cmd: ["tar", "-czf", archivePath, "-C", releaseDir, "."],
      stdout: "ignore",
      stderr: "pipe"
    });
    expect(await archive.exited).toBe(0);

    const install = Bun.spawn({
      cmd: ["sh", resolve("install.sh")],
      cwd: resolve("."),
      env: {
        ...process.env,
        HOME: root,
        PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
        PARTERRE_ARCHIVE_URL: `file://${archivePath}`,
        PARTERRE_VERSION: "v9.8.7",
        PARTERRE_INSTALL_DIR: installDir,
        PARTERRE_BIN_DIR: commandDir
      },
      stdout: "ignore",
      stderr: "pipe"
    });
    expect(await install.exited).toBe(0);
    expect(await readFile(join(installDir, "VERSION"), "utf8")).toBe(
      "v9.8.7\n"
    );
    expect(await readFile(join(installDir, ".parterre-bin-dir"), "utf8")).toBe(
      `${commandDir}\n`
    );
    expect(await readFile(join(installDir, "install.sh"), "utf8")).toBe(
      "#!/bin/sh\n"
    );
    expect(await Bun.file(join(commandDir, "parterre")).exists()).toBe(true);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
