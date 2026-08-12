import {expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

for (const flag of ["-v", "--v"]) {
  test(`prints the installed version with ${flag} without a release check`, async () => {
    const root = await mkdtemp(join(tmpdir(), "parterre-version-cli-"));
    const binDir = join(root, "bin");
    const fetchMarker = join(root, "fetch-called");
    const wrapper = join(binDir, "parterre.js");
    const preload = join(root, "preload.js");
    await mkdir(binDir, {recursive: true});
    await writeFile(join(root, "VERSION"), "v9.8.7\n");
    await writeFile(join(root, ".parterre-bin-dir"), `${binDir}\n`);
    await writeFile(
      wrapper,
      `import ${JSON.stringify(resolve("src/cli.tsx"))};\n`
    );
    await writeFile(
      preload,
      `const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("api.github.com/repos/Chillsbro/parterre/releases/latest")) {
    await Bun.write(${JSON.stringify(fetchMarker)}, "called");
    throw new Error("version flags must not check for updates");
  }
  return originalFetch(input, init);
};
`
    );

    try {
      const child = Bun.spawn({
        cmd: [Bun.which("bun") ?? "bun", "--preload", preload, wrapper, flag],
        cwd: resolve("."),
        stdout: "pipe",
        stderr: "pipe"
      });

      expect(await child.exited).toBe(0);
      expect(await new Response(child.stdout).text()).toBe("v9.8.7\n");
      expect(await Bun.file(fetchMarker).exists()).toBe(false);
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });
}
