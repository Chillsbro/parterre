import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  clearCodebaseProfile,
  closeSessionDatabase,
  getCodebaseProfile,
  isCodebaseProfileStale,
  listCodebaseProfiles,
  saveCodebaseProfile
} from "../../../src/sessions/index.js";

test("saves, recalls, filters, and clears a codebase profile keyed by path", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-cb-"));
  const codebase = "/tmp/some/../some/project";
  try {
    await saveCodebaseProfile(storageDir, {
      path: codebase,
      sourceKind: "instructions",
      summary: "Strict TypeScript with functional helpers.",
      entries: [
        {category: "naming", content: "camelCase variables, PascalCase types"},
        {category: "testing", content: "bun:test with one assertion per case"},
        {category: "  ", content: "   "}
      ]
    });

    const profile = await getCodebaseProfile(storageDir, codebase);
    expect(profile?.path).toBe(resolve(codebase));
    expect(profile?.sourceKind).toBe("instructions");
    expect(profile?.entries.length).toBe(2);

    const testingOnly = await getCodebaseProfile(
      storageDir,
      codebase,
      "testing"
    );
    expect(testingOnly?.entries.map(entry => entry.category)).toEqual([
      "testing"
    ]);

    const listed = await listCodebaseProfiles(storageDir);
    expect(listed.map(item => item.path)).toEqual([resolve(codebase)]);

    await clearCodebaseProfile(storageDir, codebase);
    expect(await getCodebaseProfile(storageDir, codebase)).toBeUndefined();
    expect(await listCodebaseProfiles(storageDir)).toEqual([]);
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});

test("re-saving replaces prior entries instead of appending", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-cb-"));
  const codebase = "/tmp/project";
  try {
    await saveCodebaseProfile(storageDir, {
      path: codebase,
      sourceKind: "patterns",
      summary: "v1",
      entries: [{category: "naming", content: "old"}]
    });
    await saveCodebaseProfile(storageDir, {
      path: codebase,
      sourceKind: "mixed",
      summary: "v2",
      entries: [{category: "structure", content: "new"}]
    });
    const profile = await getCodebaseProfile(storageDir, codebase);
    expect(profile?.summary).toBe("v2");
    expect(profile?.sourceKind).toBe("mixed");
    expect(profile?.entries).toEqual([{category: "structure", content: "new"}]);
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});

test("reports staleness for missing, fresh, and aged profiles", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-cb-"));
  const codebase = "/tmp/staleness";
  try {
    expect(await isCodebaseProfileStale(storageDir, codebase)).toBe(true);

    await saveCodebaseProfile(storageDir, {
      path: codebase,
      sourceKind: "patterns",
      summary: "learned",
      entries: []
    });
    expect(await isCodebaseProfileStale(storageDir, codebase)).toBe(false);

    const in25Hours = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect(await isCodebaseProfileStale(storageDir, codebase, in25Hours)).toBe(
      true
    );
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});
