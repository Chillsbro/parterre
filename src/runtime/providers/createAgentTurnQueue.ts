import type {AgentToolDefinition} from "./AgentProvider.js";

interface PendingTurn {
  controller: AbortController;
  started: boolean;
  settled: Promise<void>;
}

export interface AgentTurnQueue {
  enqueue(run: (signal: AbortSignal) => Promise<void>): Promise<void>;
  interrupt(interruptRunning?: () => Promise<unknown>): Promise<boolean>;
  activeSignal(): AbortSignal | undefined;
  disconnect(): Promise<void>;
}

export function createAgentTurnQueue(): AgentTurnQueue {
  const pending: PendingTurn[] = [];
  let queue: Promise<void> = Promise.resolve();
  let disconnected = false;

  return {
    enqueue(run) {
      if (disconnected)
        return Promise.reject(new Error("Agent is disconnected"));
      const turn: PendingTurn = {
        controller: new AbortController(),
        started: false,
        settled: Promise.resolve()
      };
      pending.push(turn);
      const execution = queue.then(async () => {
        try {
          if (turn.controller.signal.aborted) return;
          turn.started = true;
          await run(turn.controller.signal);
        } catch (error) {
          if (!turn.controller.signal.aborted) throw error;
        } finally {
          const index = pending.indexOf(turn);
          if (index >= 0) pending.splice(index, 1);
        }
      });
      turn.settled = execution;
      queue = execution.catch(() => {});
      return execution;
    },
    async interrupt(interruptRunning) {
      const turn = pending[0];
      if (!turn || turn.controller.signal.aborted) return false;
      turn.controller.abort();
      if (turn.started && interruptRunning) await interruptRunning();
      await turn.settled;
      return true;
    },
    activeSignal() {
      return pending.find(turn => turn.started)?.controller.signal;
    },
    async disconnect() {
      disconnected = true;
      for (const turn of pending) turn.controller.abort();
      await queue;
    }
  };
}

export function bindToolsToActiveTurn(
  tools: AgentToolDefinition[],
  turns: AgentTurnQueue
): AgentToolDefinition[] {
  return tools.map(tool => ({
    ...tool,
    handler(input) {
      const signal = turns.activeSignal();
      return signal ? tool.handler(input, {signal}) : tool.handler(input);
    }
  }));
}
