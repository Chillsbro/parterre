import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {BrowserAssertionRunner} from "../browser/createBrowserAssertionRunner.js";
import type {AgentToolDefinition} from "../providers/index.js";

const refLocator = z.object({
  by: z.literal("ref"),
  value: z.string().regex(/^(?:f\d+)?e\d+$/)
});
const roleLocator = z.object({
  by: z.literal("role"),
  role: z.string().min(1).max(80),
  name: z.string().max(500).optional(),
  exact: z.boolean().optional()
});
const valueLocator = z.object({
  by: z.enum(["text", "label", "placeholder", "testId", "css"]),
  value: z.string().min(1).max(1000),
  exact: z.boolean().optional()
});
const locator = z.discriminatedUnion("by", [
  refLocator,
  roleLocator,
  valueLocator
]);
const assertion = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("visible"), target: locator}),
  z.object({kind: z.literal("hidden"), target: locator}),
  z.object({
    kind: z.literal("text"),
    target: locator,
    expected: z.string().max(10_000),
    match: z.enum(["exact", "contains"])
  }),
  z.object({
    kind: z.literal("list"),
    target: locator,
    expected: z.array(z.string().max(1000)).max(100)
  }),
  z.object({
    kind: z.literal("value"),
    target: locator,
    expected: z.string().max(10_000)
  }),
  z.object({
    kind: z.literal("count"),
    target: locator,
    expected: z.number().int().nonnegative()
  }),
  z.object({
    kind: z.literal("checked"),
    target: locator,
    expected: z.boolean()
  }),
  z.object({
    kind: z.literal("url"),
    expected: z.string().max(10_000),
    match: z.enum(["exact", "contains"])
  }),
  z.object({
    kind: z.literal("title"),
    expected: z.string().max(10_000),
    match: z.enum(["exact", "contains"])
  })
]);
const toolInput = z.object({
  label: z.string().min(1).max(160),
  assertion,
  timeoutMs: z.number().int().min(100).max(30_000).default(5_000)
});

export function createBrowserAssertionTool(
  runner: BrowserAssertionRunner
): AgentToolDefinition {
  return {
    name: "browser_assert",
    description:
      "Make a retrying, structured assertion against the live browser. It is auto-allowed, records pass/fail evidence, and returns a testHint that generated automation must preserve.",
    schema: toolInput.shape,
    handler: async (input, context) => {
      const parsed = toolInput.parse(input);
      return runner.run(
        {
          id: randomUUID(),
          label: parsed.label,
          assertion: parsed.assertion,
          timeoutMs: parsed.timeoutMs
        },
        context
      );
    }
  };
}
