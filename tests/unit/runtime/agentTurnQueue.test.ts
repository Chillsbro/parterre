import {expect, test} from "bun:test";
import {createAgentTurnQueue} from "../../../src/runtime/providers/index.js";

test("cancels a queued turn before its work begins", async () => {
  const turns = createAgentTurnQueue();
  let ran = false;
  const queued = turns.enqueue(async () => {
    ran = true;
  });

  expect(await turns.interrupt()).toBe(true);
  await queued;
  expect(ran).toBe(false);
});

test("does not finish interruption until running work settles", async () => {
  const turns = createAgentTurnQueue();
  let settleWork = (): void => {};
  let signal: AbortSignal | undefined;
  const running = turns.enqueue(async activeSignal => {
    signal = activeSignal;
    await new Promise<void>(resolve => {
      settleWork = resolve;
    });
  });
  while (!signal) await new Promise(resolve => setTimeout(resolve, 0));

  let interruptSettled = false;
  const interruption = turns.interrupt().then(result => {
    interruptSettled = true;
    return result;
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(signal.aborted).toBe(true);
  expect(interruptSettled).toBe(false);

  settleWork();
  expect(await interruption).toBe(true);
  await running;
});
