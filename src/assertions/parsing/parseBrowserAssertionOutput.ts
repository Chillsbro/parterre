import type {BrowserAssertionResult} from "../types/index.js";

type ParsedAssertion = Omit<BrowserAssertionResult, "artifacts" | "snapshot">;

export function parseBrowserAssertionOutput(output: string): ParsedAssertion {
  const resultSection = output.split("### Result\n").at(1)?.split("\n### ")[0];
  if (!resultSection)
    throw new Error("Playwright returned no assertion result");
  const parsed: unknown = JSON.parse(resultSection.trim());
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Playwright returned a malformed assertion result");
  }
  const candidate = parsed as Partial<ParsedAssertion>;
  if (
    candidate.protocol !== "parterre.assertion.v1" ||
    typeof candidate.id !== "string" ||
    typeof candidate.label !== "string" ||
    !candidate.assertion ||
    !["passed", "failed", "error"].includes(candidate.outcome ?? "") ||
    typeof candidate.durationMs !== "number" ||
    !candidate.testHint ||
    typeof candidate.testHint.locator !== "string" ||
    typeof candidate.testHint.matcher !== "string"
  ) {
    throw new Error("Playwright returned a malformed assertion result");
  }
  return candidate as ParsedAssertion;
}
