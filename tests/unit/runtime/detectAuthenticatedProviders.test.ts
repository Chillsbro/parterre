import {expect, test} from "bun:test";
import {detectAuthenticatedProviders} from "../../../src/runtime/providers/detectAuthenticatedProviders.js";

test("reports only authenticated installed providers in preference order", async () => {
  const checked: string[] = [];
  const authenticated = await detectAuthenticatedProviders(
    ["codex", "copilot", "claude"],
    {
      codex: async () => {
        checked.push("codex");
        return true;
      },
      copilot: async () => {
        checked.push("copilot");
        return false;
      },
      claude: async () => {
        checked.push("claude");
        return true;
      }
    }
  );

  expect(checked).toEqual(["codex", "copilot", "claude"]);
  expect(authenticated).toEqual(["codex", "claude"]);
});

test("ignores providers without adapter authentication", async () => {
  const authenticated = await detectAuthenticatedProviders(["auto", "openai"], {
    codex: async () => true,
    copilot: async () => true,
    claude: async () => true
  });

  expect(authenticated).toEqual([]);
});

test("ignores inherited authentication probes", async () => {
  const probes = Object.create({codex: async () => true}) as Record<
    "codex" | "copilot" | "claude",
    () => Promise<boolean>
  >;

  expect(await detectAuthenticatedProviders(["codex"], probes)).toEqual([]);
});
