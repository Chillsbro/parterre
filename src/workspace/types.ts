export const maxWorkspaceFileBytes = 1024 * 1024;

export interface WorkspaceFileWriteRequest {
  path: string;
  content: string;
}

export interface WorkspaceWriteProposal {
  action: "create" | "replace";
  path: string;
  relativePath: string;
  bytes: number;
  before: string;
  after: string;
}

export type WorkspaceFileWriteResult =
  | {
      ok: true;
      path: string;
      relativePath: string;
      created: boolean;
      changed: boolean;
      bytes: number;
    }
  | {ok: false; error: string; path?: string};

export interface WorkspaceEditor {
  writeFile(
    request: WorkspaceFileWriteRequest,
    options?: {signal?: AbortSignal}
  ): Promise<WorkspaceFileWriteResult>;
}
