import {expect, test} from "bun:test";
import {createWorkspacePatch} from "../../../src/app/review/index.js";
import type {WorkspaceReview} from "../../../src/runtime/index.js";

function review(overrides: Partial<WorkspaceReview> = {}): WorkspaceReview {
  return {
    requestId: "review-1",
    action: "replace",
    path: "/workspace/src/example.ts",
    relativePath: "src/example.ts",
    bytes: 21,
    before: "export const value = 1;\n",
    after: "export const value = 2;\n",
    ...overrides
  };
}

test("creates an exact single-file patch with line statistics", () => {
  const result = createWorkspacePatch(review());
  expect(result).toMatchObject({ok: true, additions: 1, deletions: 1});
  if (!result.ok) throw new Error(result.error);
  expect(result.patch).toContain("--- a/src/example.ts\tbefore");
  expect(result.patch).toContain("+++ b/src/example.ts\tproposed");
  expect(result.patch).toContain("-export const value = 1;");
  expect(result.patch).toContain("+export const value = 2;");
});

test("marks new files and preserves unicode and missing final newlines", () => {
  const result = createWorkspacePatch(
    review({
      action: "create",
      before: "",
      after: "export const flower = '❖'",
      bytes: 27
    })
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.patch).toContain("--- /dev/null\tnew file");
  expect(result.patch).toContain("+export const flower = '❖'");
  expect(result.patch).toContain("\\ No newline at end of file");
});

test("fails closed when comparison exceeds its edit budget", () => {
  const result = createWorkspacePatch(
    review({
      before: Array.from({length: 100}, (_, index) => `old-${index}`).join(
        "\n"
      ),
      after: Array.from({length: 100}, (_, index) => `new-${index}`).join("\n")
    }),
    {maxEditLength: 1, timeoutMs: 1000}
  );
  expect(result).toEqual({
    ok: false,
    error:
      "The exact diff exceeded the review budget. Deny this write and ask the agent to propose a smaller change."
  });
});
