import {z} from "zod";
import {createTargetRepository} from "../../target/index.js";
import type {AgentToolDefinition} from "../providers/index.js";
import type {RuntimeContext} from "../types/index.js";

export function createMaterializeTargetTestTool(
  context: RuntimeContext
): AgentToolDefinition {
  const target = createTargetRepository(context.config.workspace);
  return {
    name: "materialize_target_test",
    description:
      "Write one generated automation test into the target repo and immediately run that repo's conventional test command. Paths are relative to the workspace and must be test-shaped. The tool refuses path escapes and pre-existing files, but it can revise a file it created earlier in this session. Returns the executed command, exit code, timeout status, stdout, and stderr.",
    schema: {
      path: z
        .string()
        .min(1)
        .describe(
          "Test file path relative to the target repo, following its learned conventions"
        ),
      content: z
        .string()
        .min(1)
        .max(1024 * 1024)
        .describe("Complete contents of the generated automation test")
    },
    handler: async (input: {path: string; content: string}) => {
      const result = await target.materializeTest(input);
      await context.publish({
        type: "target_test_finished",
        timestamp: new Date().toISOString(),
        result
      });
      return result;
    }
  };
}
