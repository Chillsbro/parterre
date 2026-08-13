import {expect, test} from "bun:test";
import {
  createStartupStatus,
  resumeStartupNotice
} from "../../../src/app/branding/index.js";

test("describes startup, readiness, and failures", () => {
  expect(createStartupStatus("starting", "⠋")).toBe("⠋ Raising the curtain");
  expect(createStartupStatus("running", "⠋")).toBe("✓ Ready");
  expect(
    createStartupStatus("failed", "⠋", "Not signed in to GitHub Copilot")
  ).toContain("Could not start · Not signed in to GitHub Copilot");
});

test("warns that resume may restore browser authentication", () => {
  expect(resumeStartupNotice).toContain("authenticated website state");
});
