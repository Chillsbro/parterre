import {expect, test} from "bun:test";
import {resolve} from "node:path";
import {loadCliCommand} from "../../../src/config/index.js";

test("parses durable resume without allowing provider or workspace drift", () => {
  expect(
    loadCliCommand([
      "resume",
      "session-1",
      "--storage",
      "./sessions",
      "--redact",
      "secret",
      "--playwright",
      "/bin/playwright-cli"
    ])
  ).toEqual({
    name: "resume",
    sessionId: "session-1",
    storageDir: resolve("./sessions"),
    playwrightCommand: "/bin/playwright-cli",
    redactions: ["secret"],
    allowUnverifiedRedactions: false
  });
  expect(() => loadCliCommand(["resume"])).toThrow(
    "resume requires a session ID"
  );
  expect(() => loadCliCommand(["resume", "one", "two"])).toThrow(
    "exactly one session ID"
  );
  expect(
    loadCliCommand(["resume", "legacy", "--allow-unverified-redactions"])
  ).toMatchObject({
    name: "resume",
    sessionId: "legacy",
    allowUnverifiedRedactions: true
  });
});
