import {z} from "zod";
import {createTargetRepository} from "../../target/index.js";
import type {AgentToolDefinition} from "../providers/index.js";
import type {RuntimeContext} from "../types/index.js";

export function createMaterializeTargetTestTool(
  context: RuntimeContext,
  passedAssertionIds: Set<string>
): AgentToolDefinition {
  const target = createTargetRepository(context.config.workspace);
  return {
    name: "materialize_target_test",
    description:
      "Write one generated automation test that reproduces passing browser_assert results, then immediately run the target repo's conventional test command. Paths are relative to the workspace and must be test-shaped. The tool refuses path escapes, pre-existing files, and missing or failing assertion IDs, but it can revise a file it created earlier in this session.",
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
        .describe("Complete contents of the generated automation test"),
      sourceAssertionIds: z
        .array(z.string().uuid())
        .min(1)
        .describe(
          "IDs of passing browser_assert results reproduced by this test"
        )
    },
    handler: async (input: {
      path: string;
      content: string;
      sourceAssertionIds: string[];
    }) => {
      if (input.sourceAssertionIds.length === 0) {
        return {
          ok: false,
          error: "Target tests require at least one passing live assertion"
        };
      }
      const unproven = input.sourceAssertionIds.filter(
        id => !passedAssertionIds.has(id)
      );
      if (unproven.length > 0) {
        return {
          ok: false,
          error: `Target tests require passing live assertions; unknown or failing IDs: ${unproven.join(", ")}`
        };
      }
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
