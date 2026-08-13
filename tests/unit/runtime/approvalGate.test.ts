import {expect, test} from "bun:test";
import {createApprovalGate} from "../../../src/runtime/index.js";
import type {SessionEvent} from "../../../src/sessions/index.js";

function createGate() {
  const events: SessionEvent[] = [];
  const gate = createApprovalGate(async event => {
    events.push(event);
  });
  return {gate, events};
}

test("settles an approval where it was requested", async () => {
  const {gate, events} = createGate();
  const pending = gate.request(
    {id: "request-1", command: "cookie-clear", args: []},
    "Sensitive"
  );
  await new Promise(resolve => setTimeout(resolve, 1));
  expect(events).toHaveLength(1);
  await gate.resolve("request-1", true);
  expect(await pending).toBe(true);
  expect(events.map(event => event.type)).toEqual([
    "approval_requested",
    "approval_resolved"
  ]);
});

test("ignores resolutions for unknown requests", async () => {
  const {gate, events} = createGate();
  await gate.resolve("missing", true);
  expect(events).toEqual([]);
});

test("records an interrupted approval as a denial", async () => {
  const {gate, events} = createGate();
  const controller = new AbortController();
  const pending = gate.request(
    {id: "request-1", command: "cookie-clear", args: []},
    "Sensitive",
    controller.signal
  );
  await new Promise(resolve => setTimeout(resolve, 1));

  controller.abort();

  expect(await pending).toBe(false);
  expect(events.map(event => event.type)).toEqual([
    "approval_requested",
    "approval_resolved"
  ]);
  expect(events.at(-1)).toMatchObject({approved: false});
});

test("abandoning denies every pending approval", async () => {
  const {gate} = createGate();
  const first = gate.request(
    {id: "request-1", command: "upload", args: []},
    "Sensitive"
  );
  const second = gate.request(
    {id: "request-2", command: "drop", args: []},
    "Sensitive"
  );
  await new Promise(resolve => setTimeout(resolve, 1));
  gate.abandonAll();
  expect(await first).toBe(false);
  expect(await second).toBe(false);
});
