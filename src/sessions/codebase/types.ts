export type CodebaseProfileSourceKind = "instructions" | "patterns" | "mixed";

export interface CodebaseProfileEntry {
  category: string;
  content: string;
}

export interface CodebaseProfile {
  path: string;
  learnedAt: string;
  sourceKind: CodebaseProfileSourceKind;
  summary: string;
  entries: CodebaseProfileEntry[];
}

export interface CodebaseProfileSummary {
  path: string;
  learnedAt: string;
  sourceKind: CodebaseProfileSourceKind;
}
