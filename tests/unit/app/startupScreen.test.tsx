import {expect, test} from "bun:test";
import {renderToString} from "ink";
import {StartupScreen} from "../../../src/components/index.js";

test("shows the failure reason under the curtain when startup fails", () => {
  const output = renderToString(
    <StartupScreen
      status="failed"
      errorMessage="Not signed in to GitHub Copilot. Run `bunx @github/copilot` and use /login to sign in."
      onComplete={() => {}}
    />
  );
  expect(output).toContain("Could not start");
  expect(output).toContain("Not signed in to GitHub Copilot");
});

test("shows only the status line while starting", () => {
  const output = renderToString(
    <StartupScreen
      status="starting"
      errorMessage={undefined}
      onComplete={() => {}}
    />
  );
  expect(output).toContain("Raising the curtain");
  expect(output).not.toContain("Could not start");
});
