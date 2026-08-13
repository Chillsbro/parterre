export type BrowserLocator =
  | {by: "ref"; value: string}
  | {
      by: "role";
      role: string;
      name?: string | undefined;
      exact?: boolean | undefined;
    }
  | {
      by: "text" | "label" | "placeholder" | "testId" | "css";
      value: string;
      exact?: boolean | undefined;
    };

export type BrowserAssertion =
  | {kind: "visible"; target: BrowserLocator}
  | {kind: "hidden"; target: BrowserLocator}
  | {
      kind: "text";
      target: BrowserLocator;
      expected: string;
      match: "exact" | "contains";
    }
  | {kind: "list"; target: BrowserLocator; expected: string[]}
  | {kind: "value"; target: BrowserLocator; expected: string}
  | {kind: "count"; target: BrowserLocator; expected: number}
  | {kind: "checked"; target: BrowserLocator; expected: boolean}
  | {
      kind: "url";
      expected: string;
      match: "exact" | "contains";
    }
  | {
      kind: "title";
      expected: string;
      match: "exact" | "contains";
    };

export interface BrowserAssertionRequest {
  id: string;
  label: string;
  assertion: BrowserAssertion;
  timeoutMs: number;
}

export interface BrowserAssertionResult {
  protocol: "parterre.assertion.v1";
  id: string;
  label: string;
  assertion: BrowserAssertion;
  outcome: "passed" | "failed" | "error";
  observed: string | string[] | number | boolean | null;
  durationMs: number;
  error?: string;
  artifacts: string[];
  snapshot?: string;
  testHint: {locator: string; matcher: string};
}
