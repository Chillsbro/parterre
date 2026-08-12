import {expect, spyOn, test} from "bun:test";
import {printReplaySession} from "../../../src/replay/index.js";
import type {SessionEvent} from "../../../src/sessions/index.js";

function assistantEvents(count: number): SessionEvent[] {
  return Array.from({length: count}, (_, index) => ({
    type: "agent_message" as const,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    message: {
      type: "assistant_message" as const,
      id: `search-${index}`,
      content: `search-${index}`
    }
  }));
}

test("replays the same bounded transcript presented by the live view", () => {
  const output: string[] = [];
  const write = spyOn(process.stdout, "write").mockImplementation(chunk => {
    output.push(String(chunk));
    return true;
  });

  try {
    printReplaySession("session-1", assistantEvents(300));
  } finally {
    write.mockRestore();
  }

  expect(output).toHaveLength(201);
  expect(output[0]).toBe("Session replay: session-1\n");
  expect(output[1]).toBe("OK 101 earlier transcript entries hidden\n");
  expect(output[2]).toBe("Agent: search-101\n");
  expect(output.at(-1)).toBe("Agent: search-299\n");
});
