import {expect, test} from "bun:test";
import {resolveResumeConfig} from "../../../src/runtime/index.js";
import {createRedactionVerifiers} from "../../../src/sessions/index.js";

const metadata = {
  schemaVersion: 3 as const,
  id: "session-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  workspace: "/workspace",
  agent: "openai",
  model: "old-model",
  playwrightSession: "browser",
  status: "stopped" as const,
  baseUrl: "https://endpoint.example/v1",
  redactionVerifiers: createRedactionVerifiers(["secret"])
};

test("pins resume to its recorded provider, workspace, model, and endpoint", () => {
  expect(
    resolveResumeConfig({
      metadata,
      model: "new-model",
      storageDir: "/sessions",
      playwrightCommand: "playwright-cli",
      redactions: ["secret"]
    })
  ).toEqual({
    provider: "openai",
    workspace: "/workspace",
    model: "new-model",
    storageDir: "/sessions",
    playwrightCommand: "playwright-cli",
    redactions: ["secret"],
    baseUrl: "https://endpoint.example/v1"
  });
});

test("rejects provider drift and endpoint redirection", () => {
  expect(() =>
    resolveResumeConfig({
      metadata: {...metadata, agent: "old-provider"},
      model: "model",
      storageDir: "/sessions",
      playwrightCommand: "playwright-cli",
      redactions: []
    })
  ).toThrow("unsupported provider");
  expect(() =>
    resolveResumeConfig({
      metadata,
      model: "model",
      storageDir: "/sessions",
      playwrightCommand: "playwright-cli",
      redactions: [],
      baseUrl: "https://other.example/v1"
    })
  ).toThrow("refusing endpoint override");
});

test("verifies original redactions while allowing additional values", () => {
  const protectedMetadata = {
    ...metadata,
    redactionCount: 1,
    redactionVerifiers: createRedactionVerifiers(["original-secret"])
  };
  expect(() =>
    resolveResumeConfig({
      metadata: protectedMetadata,
      model: "model",
      storageDir: "/sessions",
      playwrightCommand: "playwright-cli",
      redactions: ["replacement"]
    })
  ).toThrow("requires its original redaction values");
  expect(
    resolveResumeConfig({
      metadata: protectedMetadata,
      model: "model",
      storageDir: "/sessions",
      playwrightCommand: "playwright-cli",
      redactions: ["original-secret", "new-secret"]
    }).redactions
  ).toEqual(["original-secret", "new-secret"]);
});

test("fails closed when a legacy redaction policy cannot be verified", () => {
  const legacyMetadata = {
    ...metadata,
    schemaVersion: 2 as const,
    redactionVerifiers: undefined
  };
  expect(() =>
    resolveResumeConfig({
      metadata: legacyMetadata,
      model: "model",
      storageDir: "/sessions",
      playwrightCommand: "playwright-cli",
      redactions: []
    })
  ).toThrow("--allow-unverified-redactions");
  expect(
    resolveResumeConfig({
      metadata: legacyMetadata,
      model: "model",
      storageDir: "/sessions",
      playwrightCommand: "playwright-cli",
      redactions: [],
      allowUnverifiedRedactions: true
    }).provider
  ).toBe("openai");
});
