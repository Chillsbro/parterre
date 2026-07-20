import {expect, test} from "bun:test";
import {homedir} from "node:os";
import {parse, resolve} from "node:path";
import {validateCodebaseRoot} from "../../../src/runtime/index.js";

test("refuses the filesystem root", () => {
  const root = parse(resolve("/")).root;
  expect(() => validateCodebaseRoot(root)).toThrow("codebase root this broad");
});

test("refuses the home directory", () => {
  expect(() => validateCodebaseRoot(resolve(homedir()))).toThrow(
    "codebase root this broad"
  );
});

test("refuses paths that are not directories", () => {
  expect(() => validateCodebaseRoot(resolve("package.json"))).toThrow(
    "not a directory"
  );
  expect(() => validateCodebaseRoot(resolve("does-not-exist"))).toThrow(
    "not a directory"
  );
});

test("accepts an existing directory", () => {
  expect(() => validateCodebaseRoot(resolve("src"))).not.toThrow();
});
