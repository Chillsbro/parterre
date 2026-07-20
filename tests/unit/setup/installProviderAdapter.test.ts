import {expect, test} from "bun:test";
import {getAdapterRoot} from "../../../src/runtime/providers/adapterModules.js";
import {installProviderAdapter} from "../../../src/setup/running/installProviderAdapter.js";

test("installs only the selected adapter in the user adapter directory", async () => {
  const installs: {root: string; packages: string[]}[] = [];
  await installProviderAdapter("codex", async (root, packages) => {
    installs.push({root, packages});
    return 0;
  });

  expect(installs).toHaveLength(1);
  expect(installs[0]?.root).toBe(getAdapterRoot());
  expect(installs[0]?.packages).toContain("@openai/codex-sdk@^0.144.6");
  expect(installs[0]?.packages).not.toContain("@github/copilot-sdk@^1.0.6");
});

test("does not install an adapter for automatic or API providers", async () => {
  let runs = 0;
  const install = async () => {
    runs += 1;
    return 0;
  };

  await installProviderAdapter("auto", install);
  await installProviderAdapter("openai", install);

  expect(runs).toBe(0);
});

test("reports adapter installation failures", async () => {
  expect(installProviderAdapter("claude", async () => 1)).rejects.toThrow(
    "Could not install the claude adapter"
  );
});
