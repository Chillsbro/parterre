import {z} from "zod";
import {
  type CodebaseProfileSourceKind,
  saveCodebaseProfile
} from "../../sessions/index.js";
import type {AgentToolDefinition} from "../providers/index.js";
import type {RuntimeContext} from "../types/index.js";

export function createSaveCodebaseProfileTool(
  context: RuntimeContext
): AgentToolDefinition {
  return {
    name: "save_codebase_profile",
    description:
      "Persist the coding habits learned about a codebase so they can be recalled later. Call this after exploring a codebase with read_codebase during a /learn run.",
    schema: {
      path: z
        .string()
        .describe("Absolute root path of the codebase that was learned"),
      sourceKind: z
        .enum(["instructions", "patterns", "mixed"])
        .describe(
          "instructions if agent/skill files drove the profile, patterns if source scanning did, mixed for both"
        ),
      summary: z
        .string()
        .describe("One-paragraph summary of the codebase's coding habits"),
      entries: z
        .array(
          z.object({
            category: z
              .string()
              .describe("Grouping such as naming, structure, helpers, testing"),
            content: z
              .string()
              .describe("One concise sentence describing a habit")
          })
        )
        .describe("Concrete coding habits grouped by category")
    },
    handler: async (input: {
      path: string;
      sourceKind: CodebaseProfileSourceKind;
      summary: string;
      entries: Array<{category: string; content: string}>;
    }) => {
      const saved = await saveCodebaseProfile(context.config.storageDir, input);
      return {ok: true, saved};
    }
  };
}
