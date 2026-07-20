import {expect, test} from "bun:test";
import {resolve} from "node:path";
import {parsePlaywrightOutput} from "../../../src/playwright/index.js";

test("extracts page metadata and artifact links", () => {
  const output = `### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.playwright-cli/page.yml)`;
  expect(parsePlaywrightOutput(output, "C:\\workspace")).toEqual({
    url: "https://example.com/",
    title: "Example Domain",
    artifacts: [resolve("C:\\workspace", ".playwright-cli/page.yml")]
  });
});

test("discards artifact links that escape the workspace", () => {
  const output = `### Snapshot
[Secrets](/etc/credentials.yml)
[Traversal](../outside/page.pdf)
[Snapshot](.playwright-cli/page.yml)`;
  expect(parsePlaywrightOutput(output, "/workspace")).toEqual({
    artifacts: [resolve("/workspace", ".playwright-cli/page.yml")]
  });
});

test("keeps artifact links when the workspace is the filesystem root", () => {
  const output = "### Snapshot\n[Snapshot](/page.yml)";
  expect(parsePlaywrightOutput(output, "/")).toEqual({
    artifacts: [resolve("/page.yml")]
  });
});
