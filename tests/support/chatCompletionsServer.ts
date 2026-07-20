export type ScriptedCompletion =
  | {deltas: string[]}
  | {toolCalls: Array<{name: string; arguments: unknown}>}
  | {status: number; body: string};

export interface RecordedCompletionRequest {
  authorization: string | null;
  body: {
    model: string;
    stream: boolean;
    messages: Array<{
      role: string;
      content?: string | null;
      tool_call_id?: string;
    }>;
    tools: Array<{function: {name: string}}>;
  };
}

export interface ChatCompletionsServer {
  baseUrl: string;
  requests: RecordedCompletionRequest[];
  script: ScriptedCompletion[];
  stop(): void;
}

function sseResponse(events: unknown[]): Response {
  const body = `${events
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
  return new Response(body, {
    headers: {"content-type": "text/event-stream"}
  });
}

function toSseEvents(completion: ScriptedCompletion): unknown[] {
  if ("deltas" in completion) {
    return [
      ...completion.deltas.map(delta => ({
        choices: [{delta: {content: delta}}]
      })),
      {choices: [{delta: {}, finish_reason: "stop"}]}
    ];
  }
  if ("toolCalls" in completion) {
    return [
      {
        choices: [
          {
            delta: {
              tool_calls: completion.toolCalls.map((call, index) => ({
                index,
                id: `call-${index}`,
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.arguments)
                }
              }))
            }
          }
        ]
      },
      {choices: [{delta: {}, finish_reason: "tool_calls"}]}
    ];
  }
  throw new Error("Not a streamable completion");
}

export function startChatCompletionsServer(
  models: string[] = ["fixture-model"]
): ChatCompletionsServer {
  const requests: RecordedCompletionRequest[] = [];
  const script: ScriptedCompletion[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname.endsWith("/models")) {
        return Response.json({data: models.map(id => ({id}))});
      }
      if (pathname.endsWith("/chat/completions")) {
        requests.push({
          authorization: request.headers.get("authorization"),
          body: (await request.json()) as RecordedCompletionRequest["body"]
        });
        const completion = script.shift();
        if (!completion) {
          return new Response("No scripted completion left", {status: 500});
        }
        if ("status" in completion) {
          return new Response(completion.body, {status: completion.status});
        }
        return sseResponse(toSseEvents(completion));
      }
      return new Response("Not found", {status: 404});
    }
  });
  return {
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    requests,
    script,
    stop: () => server.stop(true)
  };
}
