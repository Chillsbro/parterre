import {afterEach, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  loadAdapterModule,
  resolveAdapterModule
} from "../../../src/runtime/providers/adapterModules.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true})));
});

test("loads an adapter with an import-only export", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-adapter-"));
  roots.push(root);
  const packageRoot = join(root, "node_modules", "import-only");
  await mkdir(packageRoot, {recursive: true});
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "import-only",
      type: "module",
      exports: {import: "./index.js"}
    })
  );
  await writeFile(
    join(packageRoot, "index.js"),
    "export const loaded = true;\n"
  );

  expect(resolveAdapterModule("import-only", root)).toBe(
    join(packageRoot, "index.js")
  );
  expect(
    await loadAdapterModule<{loaded: boolean}>("import-only", root)
  ).toEqual({loaded: true});
});
