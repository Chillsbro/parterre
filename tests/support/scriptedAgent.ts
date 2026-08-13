import {randomUUID} from "node:crypto";
import type {
  AgentFactory,
  AgentFactoryOptions
} from "../../src/runtime/index.js";

export type ScriptedStep =
  | {tool: string; input: unknown | ((toolResults: unknown[]) => unknown)}
  | {reply: string}
  | {error: string};

export interface ScriptedTurn {
  steps: ScriptedStep[];
}

export interface ScriptedAgent {
  factory: AgentFactory;
  turns: ScriptedTurn[];
  prompts: string[];
  toolResults: unknown[];
  modelChanges: string[];
  interruptions: number;
  waitForIdle(): Promise<void>;
}

export function createScriptedAgent(
  initialTurns: ScriptedTurn[] = []
): ScriptedAgent {
  const turns = [...initialTurns];
  const prompts: string[] = [];
  const toolResults: unknown[] = [];
  const modelChanges: string[] = [];
  let interruptions = 0;
  let queue: Promise<void> = Promise.resolve();

  const factory: AgentFactory = async (options: AgentFactoryOptions) => {
    const runTurn = async (prompt: string): Promise<void> => {
      prompts.push(prompt);
      const turn = turns.shift();
      if (!turn) throw new Error(`No scripted turn left for prompt: ${prompt}`);
      for (const step of turn.steps) {
        if ("tool" in step) {
          const tool = options.tools.find(
            definition => definition.name === step.tool
          );
          if (!tool) throw new Error(`Unknown scripted tool: ${step.tool}`);
          const input =
            typeof step.input === "function"
              ? step.input(toolResults)
              : step.input;
          toolResults.push(await tool.handler(input));
          continue;
        }
        if ("error" in step) {
          options.handlers.onSessionError(step.error, new Date().toISOString());
          continue;
        }
        options.handlers.onAssistantMessage(
          randomUUID(),
          step.reply,
          new Date().toISOString()
        );
      }
    };
    const enqueue = (prompt: string): Promise<void> => {
      const turn = queue.then(() => runTurn(prompt));
      queue = turn.catch(() => {});
      return turn;
    };
    return {
      async send(prompt: string): Promise<void> {
        await enqueue(prompt).catch(error => {
          options.handlers.onSessionError(
            error instanceof Error ? error.message : String(error),
            new Date().toISOString()
          );
        });
      },
      async sendAndWait(prompt: string): Promise<void> {
        await enqueue(prompt);
      },
      async interrupt(): Promise<boolean> {
        interruptions += 1;
        return false;
      },
      async listModels() {
        return [{id: "scripted-model", name: "Scripted Model"}];
      },
      async setModel(modelId: string): Promise<void> {
        modelChanges.push(modelId);
      },
      async disconnect(): Promise<void> {
        await queue;
      }
    };
  };

  return {
    factory,
    turns,
    prompts,
    toolResults,
    modelChanges,
    get interruptions() {
      return interruptions;
    },
    waitForIdle: () => queue
  };
}
