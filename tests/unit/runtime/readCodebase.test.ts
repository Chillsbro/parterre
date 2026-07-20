import {expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  executeReadCodebase,
  resolveWithinRoots
} from "../../../src/runtime/index.js";

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "parterre-fs-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "AGENTS.md"), "# Use bun and strict TS\n");
  await writeFile(
    join(root, "src", "helper.ts"),
    "export function toSlug(value: string) {\n  return value.trim();\n}\n"
  );
  return root;
}

test("lists, reads, and greps inside an authorized root", async () => {
  const root = await makeRoot();
  try {
    const roots = new Set([root]);

    const listed = executeReadCodebase(roots, {command: "list", path: "."});
    expect(listed.ok).toBe(true);
    expect(listed.output).toContain("AGENTS.md");
    expect(listed.output).toContain("src");

    const read = executeReadCodebase(roots, {
      command: "read",
      path: "AGENTS.md"
    });
    expect(read.ok).toBe(true);
    expect(read.output).toContain("strict TS");

    const grep = executeReadCodebase(roots, {
      command: "grep",
      pattern: "toSlug",
      glob: "*.ts"
    });
    expect(grep.ok).toBe(true);
    expect(grep.output).toContain("helper.ts");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("rejects paths that escape the authorized roots", async () => {
  const root = await makeRoot();
  try {
    const roots = new Set([join(root, "src")]);

    const escaped = executeReadCodebase(roots, {
      command: "read",
      path: "../AGENTS.md"
    });
    expect(escaped.ok).toBe(false);
    expect(escaped.error).toContain("authorized");

    const absoluteEscape = resolveWithinRoots("/etc/passwd", roots);
    expect(absoluteEscape.ok).toBe(false);

    const withinRoot = resolveWithinRoots("helper.ts", roots);
    expect(withinRoot.ok).toBe(true);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("resolves relative paths against the most recently authorized root", async () => {
  const workspace = await makeRoot();
  const learned = await makeRoot();
  try {
    const roots = new Set([workspace, learned]);
    const resolved = resolveWithinRoots("AGENTS.md", roots);
    expect(resolved).toEqual({ok: true, path: join(learned, "AGENTS.md")});
  } finally {
    await rm(workspace, {recursive: true, force: true});
    await rm(learned, {recursive: true, force: true});
  }
});

test("fails closed when no root is authorized", () => {
  const result = executeReadCodebase(new Set(), {command: "list", path: "."});
  expect(result.ok).toBe(false);
});
