import {expect, test} from "bun:test";
import {matchSlashCommands} from "../../../src/commands/index.js";

test("matches all commands on a bare slash and narrows by prefix", () => {
  expect(matchSlashCommands("/").length).toBe(6);
  expect(matchSlashCommands("/m").map(item => item.command)).toEqual([
    "/model"
  ]);
  expect(matchSlashCommands("/l").map(item => item.command)).toEqual([
    "/learn"
  ]);
  expect(matchSlashCommands("/c").map(item => item.command)).toEqual([
    "/clear"
  ]);
  expect(
    matchSlashCommands("/test checkout flow").map(item => item.command)
  ).toEqual(["/test"]);
});

test("matches nothing when input is not a slash command", () => {
  expect(matchSlashCommands("")).toEqual([]);
  expect(matchSlashCommands("hello /world")).toEqual([]);
  expect(matchSlashCommands("/nope")).toEqual([]);
});
