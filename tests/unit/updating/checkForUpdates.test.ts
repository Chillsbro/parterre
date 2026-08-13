import {expect, test} from "bun:test";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {
  compareReleaseVersions,
  fetchLatestRelease,
  findInstalledRelease,
  getParterreVersion,
  type InstalledRelease,
  installRelease,
  maybeUpdateParterre,
  type ReleaseUpdate
} from "../../../src/updating/index.js";

const installed: InstalledRelease = {
  version: "v0.1.1",
  installDir: "/opt/parterre",
  binDir: "/opt/bin"
};

function update(version = "v0.1.2"): ReleaseUpdate {
  return {
    version,
    archiveUrl: `https://github.com/Chillsbro/parterre/releases/download/${version}/parterre.tar.gz`,
    archiveSha256: "a".repeat(64)
  };
}

test("compares stable release tags numerically", () => {
  expect(compareReleaseVersions("v0.1.2", "v0.1.1")).toBe(1);
  expect(compareReleaseVersions("v0.1.1", "0.1.1")).toBe(0);
  expect(compareReleaseVersions("v0.2.0", "v0.10.0")).toBe(-1);
  expect(compareReleaseVersions("nightly", "v0.1.1")).toBeUndefined();
});

test("accepts only the expected release archive with a SHA-256 digest", async () => {
  const release = await fetchLatestRelease(async () =>
    Response.json({
      tag_name: "v0.1.2",
      assets: [
        {
          name: "parterre.tar.gz",
          browser_download_url:
            "https://github.com/Chillsbro/parterre/releases/download/v0.1.2/parterre.tar.gz",
          digest: `sha256:${"b".repeat(64)}`
        }
      ]
    })
  );

  expect(release).toEqual({
    version: "v0.1.2",
    archiveUrl:
      "https://github.com/Chillsbro/parterre/releases/download/v0.1.2/parterre.tar.gz",
    archiveSha256: "b".repeat(64)
  });

  for (const asset of [
    {
      name: "parterre.tar.gz",
      browser_download_url: "https://evil.test/a",
      digest: `sha256:${"b".repeat(64)}`
    },
    {
      name: "parterre.tar.gz",
      browser_download_url:
        "https://github.com/Chillsbro/parterre/releases/download/v0.1.2/parterre.tar.gz",
      digest: null
    },
    {
      name: "install.sh",
      browser_download_url:
        "https://github.com/Chillsbro/parterre/releases/download/v0.1.2/install.sh",
      digest: `sha256:${"b".repeat(64)}`
    }
  ]) {
    await expect(
      fetchLatestRelease(async () =>
        Response.json({tag_name: "v0.1.2", assets: [asset]})
      )
    ).rejects.toThrow("verified release archive");
  }
});

test("verifies the archive before executing only the installed updater", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-secure-update-"));
  const installerPath = join(root, "install.sh");
  const archive = new TextEncoder().encode("verified archive");
  const archiveSha256 = createHash("sha256").update(archive).digest("hex");
  await writeFile(installerPath, "#!/bin/sh\n");
  const release: InstalledRelease = {...installed, installDir: root};
  const runs: Array<{command: string; args: string[]; env: NodeJS.ProcessEnv}> =
    [];
  const downloads: string[] = [];
  try {
    await installRelease(
      release,
      {
        version: "v0.1.2",
        archiveUrl:
          "https://github.com/Chillsbro/parterre/releases/download/v0.1.2/parterre.tar.gz",
        archiveSha256
      },
      async input => {
        downloads.push(String(input));
        return new Response(archive);
      },
      async (command, args, env) => {
        const verifiedArchiveUrl = env.PARTERRE_ARCHIVE_URL;
        expect(verifiedArchiveUrl).toStartWith("file://");
        expect(
          new Uint8Array(
            await Bun.file(
              fileURLToPath(verifiedArchiveUrl as string)
            ).arrayBuffer()
          )
        ).toEqual(archive);
        runs.push({command, args, env});
        return 0;
      }
    );
    expect(downloads).toEqual([
      "https://github.com/Chillsbro/parterre/releases/download/v0.1.2/parterre.tar.gz"
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.command).toBe("sh");
    expect(runs[0]?.args).toEqual([installerPath]);
    expect(runs[0]?.env.PARTERRE_ARCHIVE_URL).toStartWith("file://");

    await expect(
      installRelease(
        release,
        {...update(), archiveSha256: "0".repeat(64)},
        async () => new Response(archive),
        async () => {
          throw new Error("must not execute");
        }
      )
    ).rejects.toThrow("integrity check failed");
    expect(runs).toHaveLength(1);

    await rm(installerPath);
    let downloadedWithoutInstaller = false;
    await expect(
      installRelease(release, {...update(), archiveSha256}, async () => {
        downloadedWithoutInstaller = true;
        return new Response(archive);
      })
    ).rejects.toThrow();
    expect(downloadedWithoutInstaller).toBe(false);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("reports installer metadata before the source package version", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-version-"));
  await writeFile(join(root, "VERSION"), "v9.8.7\n");
  await writeFile(join(root, ".parterre-bin-dir"), "/custom/bin\n");
  try {
    expect(await getParterreVersion([root])).toBe("v9.8.7");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
  expect(await getParterreVersion([])).toBe("v0.2.1");
});

test("discovers metadata only for an installer-managed release", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-release-"));
  const unmanagedRoot = await mkdtemp(join(tmpdir(), "parterre-unmanaged-"));
  const chunkDir = join(root, "dist", "chunks");
  await mkdir(chunkDir, {recursive: true});
  await writeFile(join(root, "VERSION"), "v0.1.2\n");
  await writeFile(join(root, ".parterre-bin-dir"), "/custom/bin\n");
  try {
    expect(await findInstalledRelease([chunkDir])).toEqual({
      version: "v0.1.2",
      installDir: root,
      binDir: "/custom/bin"
    });
    expect(await findInstalledRelease([unmanagedRoot])).toBeUndefined();
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(unmanagedRoot, {recursive: true, force: true});
  }
});

test("does not make a release request outside an interactive installer-managed launch", async () => {
  let checked = false;
  const restarted = await maybeUpdateParterre({
    installed,
    interactive: false,
    fetchLatest: async () => {
      checked = true;
      return update();
    }
  });

  expect(restarted).toBe(false);
  expect(checked).toBe(false);
});

test("continues launching when current", async () => {
  let installedUpdate = false;
  expect(
    await maybeUpdateParterre({
      installed,
      interactive: true,
      fetchLatest: async () => update("v0.1.1"),
      install: async () => {
        installedUpdate = true;
      }
    })
  ).toBe(false);
  expect(installedUpdate).toBe(false);
});

test("automatically installs a newer release and restarts the original command", async () => {
  const actions: string[] = [];
  const restarted = await maybeUpdateParterre({
    installed,
    interactive: true,
    fetchLatest: async () => update(),
    install: async (release, available) => {
      expect(release).toEqual(installed);
      actions.push(`install:${available.version}`);
    },
    restart: async () => {
      actions.push("restart");
    },
    write: () => {}
  });

  expect(restarted).toBe(true);
  expect(actions).toEqual(["install:v0.1.2", "restart"]);
});

test("an unavailable release check or failed update never blocks launch", async () => {
  const messages: string[] = [];
  expect(
    await maybeUpdateParterre({
      installed,
      interactive: true,
      fetchLatest: async () => {
        throw new Error("offline");
      },
      write: message => messages.push(message)
    })
  ).toBe(false);
  expect(messages).toEqual([]);

  expect(
    await maybeUpdateParterre({
      installed,
      interactive: true,
      fetchLatest: async () => update(),
      install: async () => {
        throw new Error("archive unavailable");
      },
      write: message => messages.push(message)
    })
  ).toBe(false);
  expect(messages.at(-1)).toContain("archive unavailable");
});

test("a completed update stops the old launch even when restart fails", async () => {
  const messages: string[] = [];
  expect(
    await maybeUpdateParterre({
      installed,
      interactive: true,
      fetchLatest: async () => update(),
      install: async () => {},
      restart: async () => {
        throw new Error("restart unavailable");
      },
      write: message => messages.push(message)
    })
  ).toBe(true);
  expect(messages.at(-1)).toContain("Run parterre again");
});
