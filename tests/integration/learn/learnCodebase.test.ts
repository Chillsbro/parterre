import {expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {homedir, tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {sendLearnCommand} from "../../../src/app/sending/sendLearnCommand.js";
import {buildLearnPrompt} from "../../../src/commands/index.js";
import type {CliCommand} from "../../../src/config/index.js";
import {
  closeSessionDatabase,
  getCodebaseProfile
} from "../../../src/sessions/index.js";
import {startRuntimeHarness} from "../../support/runtimeHarness.js";
import {createScriptedAgent} from "../../support/scriptedAgent.js";

async function createFixtureCodebase(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "parterre-codebase-"));
  await writeFile(
    join(root, "AGENTS.md"),
    "Use two-space indentation and arrow functions."
  );
  await mkdir(join(root, "src"), {recursive: true});
  await writeFile(
    join(root, "src", "helpers.ts"),
    "export const double = (value: number) => value * 2;\n"
  );
  return root;
}

test("learns a codebase through the real tools and recalls the profile", async () => {
  const root = await createFixtureCodebase();
  const agent = createScriptedAgent();
  const harness = await startRuntimeHarness({
    agentFactory: agent.factory,
    config: {workspace: root}
  });
  try {
    agent.turns.push({
      steps: [
        {tool: "read_codebase", input: {command: "list"}},
        {tool: "read_codebase", input: {command: "read", path: "AGENTS.md"}},
        {tool: "read_codebase", input: {command: "read", path: "/etc/hosts"}},
        {
          tool: "save_codebase_profile",
          input: {
            path: root,
            sourceKind: "instructions",
            summary: "Small utility codebase with strict formatting rules.",
            entries: [
              {category: "style", content: "Uses two-space indentation"},
              {category: "helpers", content: "Prefers arrow functions"}
            ]
          }
        },
        {reply: "Learned the codebase."}
      ]
    });
    await sendLearnCommand(harness.controller, [], root);
    await agent.waitForIdle();
    await harness.waitForEvent(
      "agent_message",
      event => event.message.type === "assistant_message"
    );

    expect(agent.prompts[0]).toBe(buildLearnPrompt(root));
    const userItem = harness.timeline().find(item => item.kind === "user");
    expect(userItem?.content).toBe(`/learn ${root}`);

    const [listing, instructions, outsideRead] = agent.toolResults as Array<{
      ok: boolean;
      error?: string;
    }>;
    expect(listing?.ok).toBe(true);
    expect(JSON.stringify(listing)).toContain("AGENTS.md");
    expect(instructions?.ok).toBe(true);
    expect(JSON.stringify(instructions)).toContain("two-space indentation");
    expect(outsideRead?.ok).toBe(false);

    const profile = await getCodebaseProfile(harness.config.storageDir, root);
    expect(profile?.sourceKind).toBe("instructions");
    expect(profile?.entries).toHaveLength(2);

    agent.turns.push({
      steps: [
        {tool: "query_codebase_profile", input: {path: root}},
        {reply: "Recalled the profile."}
      ]
    });
    await harness.controller.sendUserMessage("what did you learn?", true);
    const recalled = agent.toolResults.at(-1) as {
      ok: boolean;
      found: boolean;
    };
    expect(recalled.found).toBe(true);
  } finally {
    closeSessionDatabase(harness.config.storageDir);
    await harness.dispose();
    await rm(root, {recursive: true, force: true});
  }
});

test("refuses to authorize the filesystem root, home, and missing paths", async () => {
  const agent = createScriptedAgent();
  const harness = await startRuntimeHarness({agentFactory: agent.factory});
  try {
    expect(() => harness.controller.authorizeCodebaseRoot("/")).toThrow(
      "Refusing to authorize a codebase root this broad"
    );
    expect(() => harness.controller.authorizeCodebaseRoot(homedir())).toThrow(
      "Refusing to authorize a codebase root this broad"
    );
    expect(() =>
      harness.controller.authorizeCodebaseRoot("/definitely/not/a/real/path")
    ).toThrow("Codebase root is not a directory");
  } finally {
    await harness.dispose();
  }
});

async function loadCliCommandWithHome(
  argv: string[],
  home: string
): Promise<CliCommand> {
  const script = `const {loadCliCommand} = await import(process.env.PARTERRE_TEST_ENTRY);
process.stdout.write(JSON.stringify(loadCliCommand(JSON.parse(process.env.PARTERRE_TEST_ARGV))));`;
  const subprocess = Bun.spawn({
    cmd: [process.execPath, "-e", script],
    cwd: resolve("."),
    env: {
      ...process.env,
      HOME: home,
      PARTERRE_TEST_ENTRY: resolve("src", "config", "index.ts"),
      PARTERRE_TEST_ARGV: JSON.stringify(argv)
    },
    stdout: "pipe",
    stderr: "pipe"
  });
  const [output, errorOutput] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text()
  ]);
  if ((await subprocess.exited) !== 0) throw new Error(errorOutput);
  return JSON.parse(output) as CliCommand;
}

test("cli flags win over the user config file, which wins over defaults", async () => {
  const fakeHome = await mkdtemp(join(tmpdir(), "parterre-home-"));
  const workspace = await mkdtemp(join(tmpdir(), "parterre-workspace-"));
  try {
    await mkdir(join(fakeHome, ".parterre"), {recursive: true});
    await writeFile(
      join(fakeHome, ".parterre", "config.json"),
      JSON.stringify({provider: "openai", baseUrl: "http://user.example/v1"})
    );

    const fromUserConfig = await loadCliCommandWithHome(
      ["run", "--workspace", workspace],
      fakeHome
    );
    if (fromUserConfig.name !== "run") throw new Error("Expected run command");
    expect(fromUserConfig.config.provider).toBe("openai");
    expect(fromUserConfig.config.baseUrl).toBe("http://user.example/v1");
    expect(fromUserConfig.config.storageDir).toBe(
      join(fakeHome, ".parterre", "sessions")
    );

    const fromFlags = await loadCliCommandWithHome(
      [
        "run",
        "--workspace",
        workspace,
        "--provider",
        "claude",
        "--redact",
        "secret-a",
        "--redact",
        "secret-b"
      ],
      fakeHome
    );
    if (fromFlags.name !== "run") throw new Error("Expected run command");
    expect(fromFlags.config.provider).toBe("claude");
    expect(fromFlags.config.redactions).toEqual(["secret-a", "secret-b"]);
  } finally {
    await rm(fakeHome, {recursive: true, force: true});
    await rm(workspace, {recursive: true, force: true});
  }
});

test("defaults to automatic discovery and gives OpenAI a hosted endpoint", async () => {
  const fakeHome = await mkdtemp(join(tmpdir(), "parterre-home-"));
  const workspace = await mkdtemp(join(tmpdir(), "parterre-workspace-"));
  try {
    const automatic = await loadCliCommandWithHome(
      ["run", "--workspace", workspace],
      fakeHome
    );
    if (automatic.name !== "run") throw new Error("Expected run command");
    expect(automatic.config.provider).toBe("auto");
    expect(automatic.config.baseUrl).toBeUndefined();

    const openai = await loadCliCommandWithHome(
      ["run", "--workspace", workspace, "--provider", "openai"],
      fakeHome
    );
    if (openai.name !== "run") throw new Error("Expected run command");
    expect(openai.config.baseUrl).toBe("https://api.openai.com/v1");
    expect(openai.config.model).toBe("gpt-4.1-mini");
  } finally {
    await rm(fakeHome, {recursive: true, force: true});
    await rm(workspace, {recursive: true, force: true});
  }
});
