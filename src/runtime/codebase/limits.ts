export const codebaseReadMaxBytes = 64 * 1024;

export const grepMaxMatches = 200;

export const grepMaxFileBytes = 512 * 1024;

export const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".cache"
]);
