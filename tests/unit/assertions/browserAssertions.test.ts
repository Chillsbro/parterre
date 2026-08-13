import {expect, test} from "bun:test";
import {
  type BrowserAssertionRequest,
  compileBrowserAssertion,
  parseBrowserAssertionOutput
} from "../../../src/assertions/index.js";

test("compiles model strings as inert data and returns a stable test hint", async () => {
  const attack = '"); globalThis.__parterreInjected = true; ("';
  const request: BrowserAssertionRequest = {
    id: "assert-1",
    label: "URL stays literal",
    assertion: {kind: "url", expected: attack, match: "exact"},
    timeoutMs: 100
  };
  const compiled = compileBrowserAssertion(request);
  const assertionFunction = new Function(`return (${compiled})`)() as (page: {
    url(): string;
    waitForTimeout(): Promise<void>;
  }) => Promise<Record<string, unknown>>;
  (globalThis as Record<string, unknown>).__parterreInjected = false;

  const result = await assertionFunction({
    url: () => attack,
    waitForTimeout: async () => {}
  });

  expect((globalThis as Record<string, unknown>).__parterreInjected).toBe(
    false
  );
  expect(result).toMatchObject({
    protocol: "parterre.assertion.v1",
    outcome: "passed",
    observed: attack,
    testHint: {locator: "page", matcher: `toHaveURL(${JSON.stringify(attack)})`}
  });
  delete (globalThis as Record<string, unknown>).__parterreInjected;
});

test("parses only marker-versioned assertion results", () => {
  const payload = {
    protocol: "parterre.assertion.v1",
    id: "assert-2",
    label: "Checkout complete",
    assertion: {
      kind: "text",
      target: {by: "text", value: "Checkout complete"},
      expected: "Checkout complete",
      match: "exact"
    },
    outcome: "passed",
    observed: "Checkout complete",
    durationMs: 12,
    testHint: {
      locator: 'page.getByText("Checkout complete")',
      matcher: 'toHaveText("Checkout complete")'
    }
  } as const;
  expect(
    parseBrowserAssertionOutput(
      `### Result\n${JSON.stringify(payload)}\n### Ran Playwright code\ncode`
    )
  ).toEqual(payload);
  expect(() => parseBrowserAssertionOutput("### Result\n{}\n### Ran")).toThrow(
    "malformed"
  );
});
