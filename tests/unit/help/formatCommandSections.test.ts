import {expect, test} from "bun:test";
import {slashCommands} from "../../../src/commands/index.js";
import {formatCommandSections} from "../../../src/help/index.js";

test("renders every command's help rows under its section", () => {
  const text = formatCommandSections();
  expect(text).toContain("Workflow commands:");
  expect(text).toContain("Knowledge commands:");
  expect(text).toContain("TUI commands:");
  for (const command of slashCommands) {
    for (const row of command.help) {
      expect(text).toContain(row.usage);
      expect(text).toContain(row.description);
    }
  }
});
