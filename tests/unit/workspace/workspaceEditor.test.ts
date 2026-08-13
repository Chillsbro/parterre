import {expect, test} from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  createWorkspaceEditor,
  type WorkspaceWriteProposal
} from "../../../src/workspace/index.js";

async function makeWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "parterre-workspace-editor-"));
  await mkdir(join(root, "src"));
  return root;
}

test("creates and replaces regular workspace files after approval", async () => {
  const root = await makeWorkspace();
  const proposals: WorkspaceWriteProposal[] = [];
  const editor = createWorkspaceEditor({
    root,
    approve: async proposal => {
      proposals.push(proposal);
      return true;
    }
  });
  try {
    const created = await editor.writeFile({
      path: "README.md",
      content: "# First\n"
    });
    const unchanged = await editor.writeFile({
      path: "README.md",
      content: "# First\n"
    });
    const replaced = await editor.writeFile({
      path: "README.md",
      content: "# Updated\n"
    });

    expect(created).toMatchObject({
      ok: true,
      created: true,
      changed: true,
      path: join(root, "README.md"),
      bytes: 8
    });
    expect(unchanged).toMatchObject({
      ok: true,
      created: false,
      changed: false,
      bytes: 8
    });
    expect(replaced).toMatchObject({
      ok: true,
      created: false,
      changed: true,
      bytes: 10
    });
    expect(proposals).toEqual([
      {
        action: "create",
        path: join(root, "README.md"),
        relativePath: "README.md",
        bytes: 8
      },
      {
        action: "replace",
        path: join(root, "README.md"),
        relativePath: "README.md",
        bytes: 10
      }
    ]);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("# Updated\n");
    expect(
      (await readdir(root)).filter(name => name.startsWith(".parterre-write-"))
    ).toEqual([]);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("a denied write leaves the workspace unchanged", async () => {
  const root = await makeWorkspace();
  const editor = createWorkspaceEditor({
    root,
    approve: async () => false
  });
  try {
    const result = await editor.writeFile({
      path: "generated/README.md",
      content: "# Denied\n"
    });

    expect(result).toEqual({
      ok: false,
      error: "User denied workspace file write",
      path: join(root, "generated", "README.md")
    });
    expect(await Bun.file(join(root, "generated")).exists()).toBe(false);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("rejects unsafe paths and oversized content before approval", async () => {
  const root = await makeWorkspace();
  const outside = await mkdtemp(join(tmpdir(), "parterre-workspace-outside-"));
  await symlink(outside, join(root, "linked-directory"));
  await writeFile(join(outside, "outside.ts"), "KEEP\n");
  await symlink(join(outside, "outside.ts"), join(root, "linked-file.ts"));
  let approvals = 0;
  const editor = createWorkspaceEditor({
    root,
    approve: async () => {
      approvals += 1;
      return true;
    }
  });
  try {
    const results = await Promise.all([
      editor.writeFile({path: "../escaped.ts", content: "NOPE\n"}),
      editor.writeFile({path: join(outside, "absolute.ts"), content: "NOPE\n"}),
      editor.writeFile({path: ".git/config", content: "NOPE\n"}),
      editor.writeFile({path: "linked-directory/new.ts", content: "NOPE\n"}),
      editor.writeFile({path: "linked-file.ts", content: "NOPE\n"}),
      editor.writeFile({path: "src", content: "NOPE\n"}),
      editor.writeFile({path: "huge.ts", content: "x".repeat(1024 * 1024 + 1)})
    ]);

    expect(results.every(result => !result.ok)).toBe(true);
    expect(approvals).toBe(0);
    expect(await readFile(join(outside, "outside.ts"), "utf8")).toBe("KEEP\n");
    expect(await Bun.file(join(outside, "absolute.ts")).exists()).toBe(false);
    expect(await Bun.file(join(outside, "new.ts")).exists()).toBe(false);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(outside, {recursive: true, force: true});
  }
});

test("fails closed when a file changes while approval is pending", async () => {
  const root = await makeWorkspace();
  const path = join(root, "README.md");
  await writeFile(path, "ORIGINAL\n");
  const editor = createWorkspaceEditor({
    root,
    approve: async () => {
      await writeFile(path, "CONCURRENT\n");
      return true;
    }
  });
  try {
    const result = await editor.writeFile({
      path: "README.md",
      content: "AGENT\n"
    });

    expect(result).toMatchObject({ok: false, path});
    if (result.ok) throw new Error("Expected a concurrent change to fail");
    expect(result.error).toContain("changed while awaiting approval");
    expect(await readFile(path, "utf8")).toBe("CONCURRENT\n");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("never replaces a new file that appears while approval is pending", async () => {
  const root = await makeWorkspace();
  const path = join(root, "README.md");
  const editor = createWorkspaceEditor({
    root,
    approve: async () => {
      await writeFile(path, "CONCURRENT\n");
      return true;
    }
  });
  try {
    const result = await editor.writeFile({
      path: "README.md",
      content: "AGENT\n"
    });

    expect(result).toMatchObject({ok: false, path});
    if (result.ok) throw new Error("Expected a concurrent create to fail");
    expect(result.error).toContain("changed while awaiting approval");
    expect(await readFile(path, "utf8")).toBe("CONCURRENT\n");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
