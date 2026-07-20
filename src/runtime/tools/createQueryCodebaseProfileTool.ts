import {z} from "zod";
import {getCodebaseProfile} from "../../sessions/index.js";
import type {AgentToolDefinition} from "../providers/index.js";
import type {RuntimeContext} from "../types/index.js";

export function createQueryCodebaseProfileTool(
  context: RuntimeContext
): AgentToolDefinition {
  return {
    name: "query_codebase_profile",
    description:
      "Recall the coding habits previously learned about a codebase. Consult this before writing code or tests so your output matches the codebase's conventions.",
    schema: {
      path: z
        .string()
        .optional()
        .describe(
          "Absolute root path of the codebase. Defaults to the workspace."
        ),
      category: z
        .string()
        .optional()
        .describe("Optional category filter such as naming or testing")
    },
    handler: async (input: {path?: string; category?: string}) => {
      const profile = await getCodebaseProfile(
        context.config.storageDir,
        input.path ?? context.config.workspace,
        input.category
      );
      if (!profile) {
        return {
          ok: true,
          found: false,
          message:
            "No codebase profile learned yet. Suggest running /learn to build one."
        };
      }
      return {ok: true, found: true, profile};
    }
  };
}
