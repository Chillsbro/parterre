import {expect, test} from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createTargetRepository} from "../../../src/target/index.js";

async function makeBunTarget(preferE2e = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "parterre-target-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      packageManager: "bun@1.3.14",
      scripts: preferE2e
        ? {test: "bun -e 'process.exit(1)'", "test:e2e": "bun run verify.ts"}
        : {test: "bun run verify.ts"}
    })
  );
  await writeFile(
    join(root, "verify.ts"),
    `import {readFileSync} from "node:fs";
const content = readFileSync("tests/generated.test.ts", "utf8");
if (content === "PASS\\n") console.log("verified");
else { console.error("broken"); process.exitCode = 1; }
`
  );
  return root;
}

test("writes a test in the target repo and returns its conventional test exit code", async () => {
  const root = await makeBunTarget();
  try {
    const target = createTargetRepository(root);
    const result = await target.materializeTest({
      path: "tests/generated.test.ts",
      content: "PASS\n"
    });

    expect(result).toMatchObject({
      ok: true,
      passed: true,
      path: join(root, "tests", "generated.test.ts"),
      command: ["bun", "run", "test"],
      exitCode: 0
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.stdout).toContain("verified");
    expect(
      await readFile(join(root, "tests", "generated.test.ts"), "utf8")
    ).toBe("PASS\n");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("prefers a repo's explicit end-to-end test convention", async () => {
  const root = await makeBunTarget(true);
  try {
    const result = await createTargetRepository(root).materializeTest({
      path: "tests/generated.test.ts",
      content: "PASS\n"
    });

    expect(result).toMatchObject({
      ok: true,
      passed: true,
      command: ["bun", "run", "test:e2e"],
      exitCode: 0
    });
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("returns a failing exit code and can revise a test it created", async () => {
  const root = await makeBunTarget();
  try {
    const target = createTargetRepository(root);
    await target.materializeTest({
      path: "tests/generated.test.ts",
      content: "PASS\n"
    });
    const result = await target.materializeTest({
      path: "tests/generated.test.ts",
      content: "FAIL\n"
    });

    expect(result).toMatchObject({ok: true, passed: false, exitCode: 1});
    if (!result.ok) throw new Error(result.error);
    expect(result.stderr).toContain("broken");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("refuses non-test paths, escapes, and pre-existing files", async () => {
  const root = await makeBunTarget();
  const outsideRoot = await mkdtemp(join(tmpdir(), "parterre-target-outside-"));
  const outside = join(root, "..", "escaped.test.ts");
  try {
    await mkdir(join(root, "tests"));
    await writeFile(join(root, "tests", "existing.test.ts"), "KEEP\n");
    const symlinkTarget = join(outsideRoot, "linked.test.ts");
    await symlink(symlinkTarget, join(root, "tests", "linked.test.ts"));
    const target = createTargetRepository(root);

    const unrelated = await target.materializeTest({
      path: "src/generated.ts",
      content: "NOPE\n"
    });
    const escaped = await target.materializeTest({
      path: "../escaped.test.ts",
      content: "NOPE\n"
    });
    const existing = await target.materializeTest({
      path: "tests/existing.test.ts",
      content: "REPLACE\n"
    });
    const linked = await target.materializeTest({
      path: "tests/linked.test.ts",
      content: "ESCAPE\n"
    });

    expect(unrelated).toMatchObject({ok: false});
    expect(escaped).toMatchObject({ok: false});
    expect(existing).toMatchObject({ok: false});
    expect(linked).toMatchObject({ok: false});
    expect(await Bun.file(outside).exists()).toBe(false);
    expect(await Bun.file(symlinkTarget).exists()).toBe(false);
    expect(
      await readFile(join(root, "tests", "existing.test.ts"), "utf8")
    ).toBe("KEEP\n");
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(outsideRoot, {recursive: true, force: true});
  }
});

test("does not write when the target repo has no supported test convention", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-target-unknown-"));
  try {
    const target = createTargetRepository(root);
    const result = await target.materializeTest({
      path: "tests/generated.test.ts",
      content: "PASS\n"
    });

    expect(result).toMatchObject({ok: false});
    if (result.ok) throw new Error("Expected unsupported target to fail");
    expect(result.error).toContain("test command");
    expect(
      await Bun.file(join(root, "tests", "generated.test.ts")).exists()
    ).toBe(false);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
