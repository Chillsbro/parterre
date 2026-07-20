import {expect, test} from "bun:test";
import {installBrowser} from "../../../src/setup/running/installBrowser.js";

test("installs the bundled Playwright browser", async () => {
  const commands: {command: string; args: string[]}[] = [];
  await installBrowser(async (command, args) => {
    commands.push({command, args});
    return 0;
  });

  expect(commands).toHaveLength(1);
  expect(commands[0]?.command).toEndWith(
    "node_modules/@playwright/cli/playwright-cli.js"
  );
  expect(commands[0]?.args).toEqual(["install-browser"]);
});

test("reports browser installation failures", async () => {
  expect(installBrowser(async () => 1)).rejects.toThrow(
    "Could not install the browser"
  );
});
