import {randomUUID} from "node:crypto";
import {z} from "zod";
import {
  createWorkspaceEditor,
  maxWorkspaceFileBytes
} from "../../workspace/index.js";
import type {AgentToolDefinition} from "../providers/index.js";
import type {RuntimeContext} from "../types/index.js";

export function createWriteWorkspaceFileTool(
  context: RuntimeContext
): AgentToolDefinition {
  const editor = createWorkspaceEditor({
    root: context.config.workspace,
    approve: (proposal, signal) =>
      context.approvals.request(
        {
          id: randomUUID(),
          command: "write-workspace-file",
          args: [proposal.relativePath]
        },
        `${proposal.action === "create" ? "Create" : "Replace"} workspace file ${proposal.relativePath} (${proposal.bytes} bytes)`,
        signal
      )
  });
  return {
    name: "write_workspace_file",
    description:
      "Create or fully replace one regular file inside the selected workspace after explicit user approval. Paths must be relative. Traversal, Git metadata, symbolic links, non-files, concurrent changes, and content over 1 MiB are rejected. Read an existing file with read_codebase before replacing it, and only report success when this tool returns ok: true.",
    schema: {
      path: z
        .string()
        .min(1)
        .describe("File path relative to the selected workspace"),
      content: z
        .string()
        .max(maxWorkspaceFileBytes)
        .describe("Complete UTF-8 contents to write")
    },
    handler: async (input: {path: string; content: string}, toolContext) => {
      const result = await editor.writeFile(
        input,
        toolContext?.signal ? {signal: toolContext.signal} : undefined
      );
      await context.publish({
        type: "workspace_file_finished",
        timestamp: new Date().toISOString(),
        result
      });
      return result;
    }
  };
}
