import {z} from "zod";
import {executeReadCodebase} from "../codebase/index.js";
import type {AgentToolDefinition} from "../providers/index.js";
import type {RuntimeContext} from "../types/index.js";

export function createReadCodebaseTool(
  context: RuntimeContext
): AgentToolDefinition {
  return {
    name: "read_codebase",
    description:
      "Read-only access to an authorized codebase for learning its coding habits. Use command 'list' to list a directory, 'read' to read a file, or 'grep' to search file contents for a pattern. Paths must stay within a codebase the user targeted with /learn (or the current workspace).",
    schema: {
      command: z
        .enum(["list", "read", "grep"])
        .describe("list a directory, read a file, or grep for a pattern"),
      path: z
        .string()
        .optional()
        .describe(
          "Absolute path inside an authorized root, or a path relative to the most recently authorized root. Defaults to that root."
        ),
      pattern: z
        .string()
        .optional()
        .describe("Regular expression to search for (grep only)"),
      glob: z
        .string()
        .optional()
        .describe("Optional filename glob to limit grep, e.g. *.ts")
    },
    handler: async (input: {
      command: "list" | "read" | "grep";
      path?: string;
      pattern?: string;
      glob?: string;
    }) => {
      return executeReadCodebase(context.authorizedCodebaseRoots, {
        command: input.command,
        ...(input.path ? {path: input.path} : {}),
        ...(input.pattern ? {pattern: input.pattern} : {}),
        ...(input.glob ? {glob: input.glob} : {})
      });
    }
  };
}
