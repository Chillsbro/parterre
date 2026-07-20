import {rm} from "node:fs/promises";

await rm("dist", {recursive: true, force: true});

const result = await Bun.build({
  entrypoints: ["src/cli.tsx"],
  outdir: "dist",
  target: "bun",
  packages: "external",
  minify: true,
  splitting: true,
  naming: {
    entry: "parterre.js",
    chunk: "chunks/[name]-[hash].[ext]"
  }
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exitCode = 1;
}
