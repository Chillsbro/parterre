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
          tool: "materialize_target_test",
          input: {
            path: "tests/checkout.test.ts",
            content: 'test("checkout completes", () => {});\n'
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
    ).toContain("checkout completes");
    expect(agent.toolResults[0]).toEqual(event.result);
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
});
