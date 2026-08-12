import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {BrowserCommandRunner} from "../browser/index.js";
import type {AgentToolDefinition} from "../providers/index.js";

export function createPlaywrightTool(
  runner: BrowserCommandRunner
): AgentToolDefinition {
  return {
    name: "playwright_cli",
    description:
      "Control the embedded browser with an allowlisted Playwright CLI command, including video-start and video-stop for recordings. Use this for every browser interaction so the user can watch the page inside Parterre.",
    schema: {
      command: z
        .string()
        .describe(
          "Playwright CLI command such as open, goto, click, fill, or screenshot"
        ),
      args: z
        .array(z.union([z.string(), z.number(), z.boolean()]))
        .default([])
        .describe("Arguments passed to the Playwright CLI command"),
      reason: z
        .string()
        .optional()
        .describe("Short explanation of why the action is needed")
    },
    handler: async (
      input: {
        command: string;
        args: Array<string | number | boolean>;
        reason?: string;
      },
      context
    ) => {
      return runner.run(
        {
          id: randomUUID(),
          command: input.command,
          args: input.args ?? [],
          ...(input.reason ? {reason: input.reason} : {})
        },
        context
      );
    }
  };
}
