import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import type {AppConfig} from "../../src/config/index.js";
import {
  type AgentFactory,
  createSessionRuntime,
  type RuntimeController
} from "../../src/runtime/index.js";
import type {SessionEvent} from "../../src/sessions/index.js";
import {
  buildTimelineItems,
  type TimelineItem
} from "../../src/transcript/index.js";

export interface RuntimeHarness {
  controller: RuntimeController;
  config: AppConfig;
  events: SessionEvent[];
  frames: string[];
  statuses: string[];
  timeline(): TimelineItem[];
  waitForEvent<Type extends SessionEvent["type"]>(
    type: Type,
    predicate?: (event: Extract<SessionEvent, {type: Type}>) => boolean,
    timeoutMs?: number
  ): Promise<Extract<SessionEvent, {type: Type}>>;
  dispose(): Promise<void>;
}

export function playwrightCliPath(): string {
  return resolve("node_modules", ".bin", "playwright-cli");
}

export async function startRuntimeHarness(options: {
  agentFactory?: AgentFactory;
  config?: Partial<AppConfig>;
}): Promise<RuntimeHarness> {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-harness-"));
  const config: AppConfig = {
    provider: "copilot",
    workspace: resolve("."),
    model: "auto",
    storageDir,
    playwrightCommand: playwrightCliPath(),
    redactions: [],
    ...options.config
  };
  const events: SessionEvent[] = [];
  const frames: string[] = [];
  const statuses: string[] = [];
  const listeners = new Set<() => void>();

  const controller = await createSessionRuntime({
    config,
    ...(options.agentFactory ? {agentFactory: options.agentFactory} : {}),
    onNotification: notification => {
      if (notification.type === "event") events.push(notification.event);
      if (notification.type === "liveFrame") frames.push(notification.path);
      if (notification.type === "status") statuses.push(notification.status);
      for (const listener of listeners) listener();
    }
  });

  let disposed = false;
  return {
    controller,
    config,
    events,
    frames,
    statuses,
    timeline: () => buildTimelineItems(events),
    waitForEvent(type, predicate, timeoutMs = 30000) {
      type Matched = Extract<SessionEvent, {type: typeof type}>;
      const matches = (event: SessionEvent): event is Matched =>
        event.type === type && (predicate?.(event as Matched) ?? true);
      const existing = events.find(matches);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolveWait, rejectWait) => {
        const timer = setTimeout(() => {
          listeners.delete(check);
          rejectWait(new Error(`Timed out waiting for ${type} event`));
        }, timeoutMs);
        const check = (): void => {
          const found = events.find(matches);
          if (!found) return;
          clearTimeout(timer);
          listeners.delete(check);
          resolveWait(found);
        };
        listeners.add(check);
      });
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await controller.stop();
      await rm(storageDir, {recursive: true, force: true});
    }
  };
}
