import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {ModelChoice} from "../types/index.js";
import type {AgentFactoryOptions, AgentHandle} from "./AgentProvider.js";
import {createAgentTurnQueue} from "./createAgentTurnQueue.js";

const maxToolIterations = 32;

interface ToolCallDraft {
  id: string;
  name: string;
  arguments: string;
}

type ChatMessage =
  | {role: "system" | "user"; content: string}
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: {name: string; arguments: string};
      }[];
    }
  | {role: "tool"; tool_call_id: string; content: string};

interface CompletionChunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: {name?: string; arguments?: string};
      }[];
    };
  }[];
}

function buildSystemPrompt(append: string): string {
  return `You are an autonomous agent. Work toward the user's goal by calling the available tools, then reply with a concise summary once the task is complete.\n\n${append}`;
}

async function readCompletionStream(
  response: Response,
  onDelta: (delta: string) => void
): Promise<{content: string; toolCalls: ToolCallDraft[]}> {
  if (!response.body) throw new Error("Model endpoint returned no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const drafts = new Map<number, ToolCallDraft>();
  let content = "";
  let buffer = "";
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let chunk: CompletionChunk;
        try {
          chunk = JSON.parse(payload) as CompletionChunk;
        } catch {
          continue;
        }
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          onDelta(delta.content);
        }
        for (const fragment of delta?.tool_calls ?? []) {
          const draft = drafts.get(fragment.index) ?? {
            id: "",
            name: "",
            arguments: ""
          };
          if (fragment.id) draft.id = fragment.id;
          if (fragment.function?.name) draft.name = fragment.function.name;
          if (fragment.function?.arguments) {
            draft.arguments += fragment.function.arguments;
          }
          drafts.set(fragment.index, draft);
        }
      }
    }
  }
  const toolCalls = [...drafts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, draft]) => draft)
    .filter(draft => draft.id && draft.name);
  return {content, toolCalls};
}

export async function createOpenAiAgent(
  options: AgentFactoryOptions,
  fetchImpl: typeof fetch = fetch
): Promise<AgentHandle> {
  const baseUrl = options.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error(
      "The openai provider requires a base URL. Pass --base-url or run `parterre setup`."
    );
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const headers = {
    "content-type": "application/json",
    ...(apiKey ? {authorization: `Bearer ${apiKey}`} : {})
  };
  const abort = new AbortController();
  const turns = createAgentTurnQueue();
  const tools = new Map(
    options.tools.map(definition => [
      definition.name,
      {
        schema: z.object(definition.schema),
        handler: definition.handler,
        payload: {
          type: "function" as const,
          function: {
            name: definition.name,
            description: definition.description,
            parameters: z.toJSONSchema(z.object(definition.schema))
          }
        }
      }
    ])
  );
  const history: ChatMessage[] = [
    {role: "system", content: buildSystemPrompt(options.systemPromptAppend)},
    ...(options.resume?.history ?? [])
  ];
  const listModels = async (): Promise<ModelChoice[]> => {
    const response = await fetchImpl(`${baseUrl}/models`, {
      headers,
      signal: abort.signal
    });
    if (!response.ok) {
      throw new Error(`Model endpoint returned ${response.status} for /models`);
    }
    const payload = (await response.json()) as {data?: {id?: string}[]};
    return (payload.data ?? []).flatMap(entry =>
      entry.id ? [{id: entry.id, name: entry.id}] : []
    );
  };

  let model = options.model;
  if (model === "auto") {
    const models = await listModels();
    const first = models[0];
    if (!first) throw new Error(`No models available at ${baseUrl}`);
    model = first.id;
  }
  await options.handlers.onSessionIdentity?.({provider: "openai", model});

  const requestCompletion = async (
    turnId: string,
    signal: AbortSignal
  ): Promise<{content: string; toolCalls: ToolCallDraft[]}> => {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages: history,
        tools: [...tools.values()].map(tool => tool.payload),
        stream: true
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Model endpoint returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
      );
    }
    return readCompletionStream(response, delta => {
      options.handlers.onAssistantDelta(
        turnId,
        delta,
        new Date().toISOString()
      );
    });
  };

  const executeToolCall = async (
    call: ToolCallDraft,
    signal: AbortSignal
  ): Promise<string> => {
    const tool = tools.get(call.name);
    if (!tool)
      return JSON.stringify({ok: false, error: `Unknown tool: ${call.name}`});
    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(call.arguments || "{}");
    } catch {
      parsedInput = undefined;
    }
    const validated = tool.schema.safeParse(parsedInput);
    if (!validated.success) {
      return JSON.stringify({
        ok: false,
        error: `Invalid arguments for ${call.name}: ${validated.error.message}`
      });
    }
    try {
      return JSON.stringify(
        (await tool.handler(validated.data, {signal})) ?? {ok: true}
      );
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const runTurn = async (signal: AbortSignal): Promise<void> => {
    for (let iteration = 0; iteration < maxToolIterations; iteration += 1) {
      signal.throwIfAborted();
      const turnId = randomUUID();
      const completion = await requestCompletion(turnId, signal);
      if (completion.toolCalls.length === 0) {
        history.push({role: "assistant", content: completion.content});
        options.handlers.onAssistantMessage(
          turnId,
          completion.content,
          new Date().toISOString()
        );
        return;
      }
      history.push({
        role: "assistant",
        content: completion.content || null,
        tool_calls: completion.toolCalls.map(call => ({
          id: call.id,
          type: "function",
          function: {name: call.name, arguments: call.arguments}
        }))
      });
      for (const call of completion.toolCalls) {
        signal.throwIfAborted();
        history.push({
          role: "tool",
          tool_call_id: call.id,
          content: await executeToolCall(call, signal)
        });
        signal.throwIfAborted();
      }
    }
    options.handlers.onAssistantMessage(
      randomUUID(),
      `Stopped after ${maxToolIterations} tool rounds without a final reply.`,
      new Date().toISOString()
    );
  };

  const enqueue = (prompt: string): Promise<void> =>
    turns.enqueue(async signal => {
      const historyCheckpoint = history.length;
      try {
        history.push({role: "user", content: prompt});
        await runTurn(signal);
      } finally {
        if (signal.aborted) history.splice(historyCheckpoint);
      }
    });

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
    interrupt: () => turns.interrupt(),
    listModels,
    async setModel(modelId: string): Promise<void> {
      model = modelId;
    },
    async disconnect(): Promise<void> {
      abort.abort();
      await turns.disconnect();
    }
  };
}
