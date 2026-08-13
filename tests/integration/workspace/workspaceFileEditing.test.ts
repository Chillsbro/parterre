import {expect, test} from "bun:test";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {
  AgentFactory,
  AgentToolDefinition
} from "../../../src/runtime/index.js";
import {closeSessionDatabase} from "../../../src/sessions/index.js";
import {startRuntimeHarness} from "../../support/runtimeHarness.js";
import {createScriptedAgent} from "../../support/scriptedAgent.js";

test("the runtime writes README and source files after explicit approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-workspace-integration-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "README.md"), "# Old\n");
  const agent = createScriptedAgent([
    {
      steps: [
        {
          tool: "write_workspace_file",
          input: {path: "README.md", content: "# New README\n"}
        },
        {
          tool: "write_workspace_file",
          input: {
            path: "src/greeting.ts",
            content: 'export const greeting = "hello";\n'
          }
        },
        {reply: "The README and source file are written."}
      ]
    }
  ]);
  const harness = await startRuntimeHarness({
    agentFactory: agent.factory,
    config: {workspace: root}
  });
  try {
    const turn = harness.controller.sendUserMessage(
      "Update the README and write the implementation",
      true
    );
    const readmeApproval = await harness.waitForEvent(
      "approval_requested",
      event => event.request.args.includes("README.md")
    );
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("# Old\n");
    await harness.controller.resolveApproval(readmeApproval.request.id, true);

    const sourceApproval = await harness.waitForEvent(
      "approval_requested",
      event => event.request.args.includes("src/greeting.ts")
    );
    expect(await Bun.file(join(root, "src", "greeting.ts")).exists()).toBe(
      false
    );
    await harness.controller.resolveApproval(sourceApproval.request.id, true);
    await turn;
    await agent.waitForIdle();

    expect(await readFile(join(root, "README.md"), "utf8")).toBe(
      "# New README\n"
    );
    expect(await readFile(join(root, "src", "greeting.ts"), "utf8")).toBe(
      'export const greeting = "hello";\n'
    );
    const writes = harness.events.filter(
      event => event.type === "workspace_file_finished"
    );
    expect(writes).toHaveLength(2);
    expect(agent.toolResults).toEqual([
      expect.objectContaining({
        ok: true,
        created: false,
        path: join(root, "README.md")
      }),
      expect.objectContaining({
        ok: true,
        created: true,
        path: join(root, "src", "greeting.ts")
      })
    ]);
    expect(harness.timeline()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool",
          content: "Workspace file updated — view ",
          link: expect.objectContaining({label: "README.md"}),
          ok: true
        }),
        expect.objectContaining({
          kind: "tool",
          content: "Workspace file created — view ",
          link: expect.objectContaining({label: "src/greeting.ts"}),
          ok: true
        })
      ])
    );
  } finally {
    closeSessionDatabase(harness.config.storageDir);
    await harness.dispose();
    await rm(root, {recursive: true, force: true});
  }
});

test("interrupting a workspace write denies approval without touching disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "parterre-workspace-interrupt-"));
  let activeAbort: AbortController | undefined;
  let activeTurn: Promise<void> | undefined;
  let writeResult: unknown;
  const factory: AgentFactory = async options => {
    const write = options.tools.find(
      tool => tool.name === "write_workspace_file"
    ) as AgentToolDefinition;
    const send = (): Promise<void> => {
      activeAbort = new AbortController();
      activeTurn = write
        .handler(
          {path: "README.md", content: "# Interrupted\n"},
          {signal: activeAbort.signal}
        )
        .then(result => {
          writeResult = result;
        });
      return activeTurn;
    };
    return {
      send,
      sendAndWait: send,
      async interrupt() {
        if (!activeAbort || !activeTurn) return false;
        activeAbort.abort();
        await activeTurn;
        return true;
      },
      async listModels() {
        return [];
      },
      async setModel() {},
      async disconnect() {
        await activeTurn;
      }
    };
  };
  const harness = await startRuntimeHarness({
    agentFactory: factory,
    config: {workspace: root}
  });
  try {
    const turn = harness.controller.sendUserMessage("Write a README", true);
    await harness.waitForEvent("approval_requested");
    expect(await Bun.file(join(root, "README.md")).exists()).toBe(false);

    expect(await harness.controller.interrupt()).toBe(true);
    await turn;

    expect(writeResult).toEqual({
      ok: false,
      error: "User denied workspace file write",
      path: join(root, "README.md")
    });
    expect(await Bun.file(join(root, "README.md")).exists()).toBe(false);
    expect(harness.events.map(event => event.type)).toContain(
      "agent_interrupted"
    );
  } finally {
    closeSessionDatabase(harness.config.storageDir);
    await harness.dispose();
    await rm(root, {recursive: true, force: true});
  }
});
