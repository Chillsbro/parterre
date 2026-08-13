import {expect, test} from "bun:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {closeSessionDatabase} from "../../../src/sessions/index.js";
import {startRuntimeHarness} from "../../support/runtimeHarness.js";
import {createScriptedAgent} from "../../support/scriptedAgent.js";

async function createTargetRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "parterre-target-integration-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      packageManager: "bun@1.3.14",
      scripts: {test: "bun run verify.ts"}
    })
  );
  await writeFile(
    join(root, "verify.ts"),
    `import {readFileSync} from "node:fs";
const test = readFileSync("tests/checkout.test.ts", "utf8");
if (!test.includes("checkout completes")) process.exitCode = 1;
`
  );
  return root;
}

test("the runtime writes generated automation into its target repo", async () => {
  const root = await createTargetRepo();
  const agent = createScriptedAgent([
    {
      steps: [
        {
          tool: "playwright_cli",
          input: {
            command: "open",
            args: [
              "data:text/html,<h1>Checkout%20complete</h1><p>Order%20A-123</p>"
            ]
          }
        },
        {
          tool: "browser_assert",
          input: {
            label: "checkout completed",
            assertion: {
              kind: "text",
              target: {
                by: "role",
                role: "heading",
                name: "Checkout complete",
                exact: true
              },
              expected: "Checkout complete",
              match: "exact"
            },
            timeoutMs: 1000
          }
        },
        {
          tool: "materialize_target_test",
          input: (results: unknown[]) => {
            const assertion = results[1] as {
              id: string;
              testHint: {locator: string; matcher: string};
            };
            return {
              path: "tests/checkout.test.ts",
              content: `test("checkout completes", async ({page}) => { await expect(${assertion.testHint.locator}).${assertion.testHint.matcher}; });\n`,
              sourceAssertionIds: [assertion.id]
            };
          }
        },
        {reply: "The checkout automation is written and passing."}
      ]
    }
  ]);
  const harness = await startRuntimeHarness({
    agentFactory: agent.factory,
    config: {workspace: root}
  });
  try {
    await harness.controller.sendUserMessage("/test checkout", true);
    await agent.waitForIdle();
    const event = await harness.waitForEvent("target_test_finished");

    expect(event.result).toMatchObject({
      ok: true,
      passed: true,
      path: join(root, "tests", "checkout.test.ts"),
      command: ["bun", "run", "test"],
      exitCode: 0
    });
    expect(
      await readFile(join(root, "tests", "checkout.test.ts"), "utf8")
    ).toContain('toHaveText("Checkout complete")');
    expect(agent.toolResults[2]).toEqual(event.result);
    expect(event.result).toMatchObject({
      sourceAssertionIds: [(agent.toolResults[1] as {id: string}).id]
    });
    expect(harness.timeline()).toContainEqual(
      expect.objectContaining({
        kind: "tool",
        detail: "exit 0",
        ok: true
      })
    );
  } finally {
    closeSessionDatabase(harness.config.storageDir);
    await harness.dispose();
    await rm(root, {recursive: true, force: true});
  }
}, 60000);
