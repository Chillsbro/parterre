import {expect, test} from "bun:test";
import {buildLearnPrompt} from "../../../src/commands/index.js";

test("builds a learn prompt anchored to the codebase root", () => {
  const prompt = buildLearnPrompt("/home/dev/project");
  expect(prompt).toContain("/home/dev/project");
  expect(prompt).toContain("read_codebase");
  expect(prompt).toContain("save_codebase_profile");
  expect(prompt).toContain("AGENTS.md");
  expect(prompt).toContain("query_codebase_profile");
});
