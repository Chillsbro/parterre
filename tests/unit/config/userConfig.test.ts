import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readUserConfig, writeUserConfig} from "../../../src/config/index.js";

test("round-trips the provider preference", async () => {
  const dir = await mkdtemp(join(tmpdir(), "parterre-config-"));
  const configPath = join(dir, "config.json");
  try {
    expect(readUserConfig(configPath)).toEqual({});
    writeUserConfig({provider: "codex"}, configPath);
    expect(readUserConfig(configPath)).toEqual({provider: "codex"});
    writeUserConfig({provider: "claude"}, configPath);
    expect(readUserConfig(configPath)).toEqual({provider: "claude"});
    writeUserConfig({provider: "copilot"}, configPath);
    expect(readUserConfig(configPath)).toEqual({provider: "copilot"});
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test("ignores unknown providers and malformed files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "parterre-config-"));
  const configPath = join(dir, "config.json");
  try {
    await Bun.write(configPath, '{"provider": "skynet"}');
    expect(readUserConfig(configPath)).toEqual({});
    await Bun.write(configPath, "not json");
    expect(readUserConfig(configPath)).toEqual({});
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
