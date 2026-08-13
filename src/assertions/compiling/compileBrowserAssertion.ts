import type {
  BrowserAssertion,
  BrowserAssertionRequest,
  BrowserLocator
} from "../types/index.js";

function asCodeLiteral(value: unknown): string {
  return JSON.stringify(JSON.stringify(value))
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function locatorHint(locator: BrowserLocator): string {
  if (locator.by === "ref") {
    return `page.locator(${JSON.stringify(`aria-ref=${locator.value}`)})`;
  }
  if (locator.by === "role") {
    const options = {
      ...(locator.name === undefined ? {} : {name: locator.name}),
      ...(locator.exact === undefined ? {} : {exact: locator.exact})
    };
    return `page.getByRole(${JSON.stringify(locator.role)}${
      Object.keys(options).length > 0 ? `, ${JSON.stringify(options)}` : ""
    })`;
  }
  const method = {
    text: "getByText",
    label: "getByLabel",
    placeholder: "getByPlaceholder",
    testId: "getByTestId",
    css: "locator"
  }[locator.by];
  const exact =
    locator.by !== "css" &&
    locator.by !== "testId" &&
    locator.exact !== undefined
      ? `, ${JSON.stringify({exact: locator.exact})}`
      : "";
  return `page.${method}(${JSON.stringify(locator.value)}${exact})`;
}

function assertionHint(assertion: BrowserAssertion): {
  locator: string;
  matcher: string;
} {
  const locator =
    "target" in assertion ? locatorHint(assertion.target) : "page";
  if (assertion.kind === "visible") return {locator, matcher: "toBeVisible()"};
  if (assertion.kind === "hidden") return {locator, matcher: "toBeHidden()"};
  if (assertion.kind === "text") {
    return {
      locator,
      matcher:
        assertion.match === "exact"
          ? `toHaveText(${JSON.stringify(assertion.expected)})`
          : `toContainText(${JSON.stringify(assertion.expected)})`
    };
  }
  if (assertion.kind === "list") {
    return {
      locator,
      matcher: `toHaveText(${JSON.stringify(assertion.expected)})`
    };
  }
  if (assertion.kind === "value") {
    return {
      locator,
      matcher: `toHaveValue(${JSON.stringify(assertion.expected)})`
    };
  }
  if (assertion.kind === "count") {
    return {locator, matcher: `toHaveCount(${assertion.expected})`};
  }
  if (assertion.kind === "checked") {
    return {
      locator,
      matcher: assertion.expected ? "toBeChecked()" : "not.toBeChecked()"
    };
  }
  const matcher = assertion.kind === "url" ? "toHaveURL" : "toHaveTitle";
  const escaped = assertion.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    locator,
    matcher:
      assertion.match === "exact"
        ? `${matcher}(${JSON.stringify(assertion.expected)})`
        : `${matcher}(new RegExp(${JSON.stringify(escaped)}))`
  };
}

export function compileBrowserAssertion(
  request: BrowserAssertionRequest
): string {
  const payload = {...request, testHint: assertionHint(request.assertion)};
  return `async page => {
  const request = JSON.parse(${asCodeLiteral(payload)});
  const startedAt = Date.now();
  const normalize = value => String(value).replace(/\\s+/g, " ").trim();
  const locate = locator => {
    if (locator.by === "ref") return page.locator("aria-ref=" + locator.value);
    if (locator.by === "role") return page.getByRole(locator.role, { name: locator.name, exact: locator.exact });
    if (locator.by === "text") return page.getByText(locator.value, { exact: locator.exact });
    if (locator.by === "label") return page.getByLabel(locator.value, { exact: locator.exact });
    if (locator.by === "placeholder") return page.getByPlaceholder(locator.value, { exact: locator.exact });
    if (locator.by === "testId") return page.getByTestId(locator.value);
    return page.locator(locator.value);
  };
  const observe = async assertion => {
    if (assertion.kind === "url") return page.url();
    if (assertion.kind === "title") return page.title();
    const target = locate(assertion.target);
    const count = await target.count();
    if (assertion.kind === "count") return count;
    if (assertion.kind === "visible") return count > 0 && await target.first().isVisible();
    if (assertion.kind === "hidden") return count === 0 || !(await target.first().isVisible());
    if (assertion.kind === "text") return count === 0 ? null : normalize((await target.first().textContent()) ?? "");
    if (assertion.kind === "list") return (await target.allTextContents()).map(normalize);
    if (assertion.kind === "value") return count === 0 ? null : await target.first().inputValue();
    if (assertion.kind === "checked") return count === 0 ? null : await target.first().isChecked();
    throw new Error("Unsupported assertion kind: " + assertion.kind);
  };
  const matches = (assertion, observed) => {
    if (assertion.kind === "visible" || assertion.kind === "hidden") return observed === true;
    if (assertion.kind === "text") {
      const actual = observed === null ? "" : normalize(observed);
      const expected = normalize(assertion.expected);
      return assertion.match === "exact" ? actual === expected : actual.includes(expected);
    }
    if (assertion.kind === "list") {
      return Array.isArray(observed) && JSON.stringify(observed.map(normalize)) === JSON.stringify(assertion.expected.map(normalize));
    }
    if (assertion.kind === "url" || assertion.kind === "title") {
      return assertion.match === "exact" ? observed === assertion.expected : String(observed).includes(assertion.expected);
    }
    return observed === assertion.expected;
  };
  let observed = null;
  let outcome = "failed";
  let error;
  try {
    do {
      observed = await observe(request.assertion);
      if (matches(request.assertion, observed)) {
        outcome = "passed";
        break;
      }
      if (Date.now() - startedAt >= request.timeoutMs) break;
      await page.waitForTimeout(100);
    } while (true);
  } catch (caught) {
    outcome = "error";
    error = caught instanceof Error ? caught.message : String(caught);
  }
  return {
    protocol: "parterre.assertion.v1",
    id: request.id,
    label: request.label,
    assertion: request.assertion,
    outcome,
    observed,
    durationMs: Date.now() - startedAt,
    ...(error ? { error } : {}),
    testHint: request.testHint
  };
}`;
}
