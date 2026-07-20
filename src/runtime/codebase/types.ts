export interface ReadCodebaseRequest {
  command: "list" | "read" | "grep";
  path?: string;
  pattern?: string;
  glob?: string;
}

export interface ReadCodebaseResult {
  ok: boolean;
  output?: string;
  error?: string;
}
