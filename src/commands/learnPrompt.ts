export function buildLearnPrompt(root: string): string {
  return `Learn the coding habits of the codebase rooted at:
${root}

Use the read_codebase tool for every filesystem access (list, read, grep). Do not use shell commands.

1. First look for explicit agent or skill instruction files and read the ones you find:
   AGENTS.md, CLAUDE.md, .github/copilot-instructions.md, .cursorrules, and any SKILL.md under .agents/, .claude/, or skills directories.
2. If no such files exist (or they are thin), fall back to grep/glob over the source to gather recurring patterns: naming conventions, file/module structure, shared helpers and utilities, import style, error handling, and how tests are written.
3. Distill what you find into concise, concrete habits — each entry one short sentence, grouped by category (for example: naming, structure, helpers, imports, testing, errors).
4. Persist the result with the save_codebase_profile tool: pass the same root path, a one-paragraph summary, sourceKind ("instructions" if you relied on instruction files, "patterns" if you relied on source scanning, "mixed" if both), and the list of entries.
5. Briefly confirm to the user what you learned.

Later, before writing code or tests for this codebase, consult query_codebase_profile so your output matches its conventions.`;
}
