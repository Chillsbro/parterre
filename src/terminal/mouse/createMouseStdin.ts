import {PassThrough} from "node:stream";
import {type MouseWheelEvent, parseMouseInput} from "./parseMouseInput.js";

export interface MouseStdin {
  stdin: NodeJS.ReadStream;
  subscribeWheel(listener: (event: MouseWheelEvent) => void): () => void;
  enableTracking(): void;
  disableTracking(): void;
  detach(): void;
}

export function createMouseStdin(
  source: NodeJS.ReadStream,
  output: NodeJS.WriteStream
): MouseStdin {
  const proxy = new PassThrough();
  const listeners = new Set<(event: MouseWheelEvent) => void>();
  let pending = "";
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flushPending = (): void => {
    flushTimer = undefined;
    if (!pending) return;
    proxy.write(pending);
    pending = "";
  };
  const handleData = (chunk: Buffer | string): void => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    const parsed = parseMouseInput(pending + chunk.toString());
    pending = parsed.pending;
    for (const event of parsed.wheel) {
      for (const listener of listeners) listener(event);
    }
    if (parsed.text) proxy.write(parsed.text);
    if (pending) flushTimer = setTimeout(flushPending, 10);
  };
  source.on("data", handleData);
  Object.assign(proxy, {
    isTTY: source.isTTY,
    setRawMode: (mode: boolean) => {
      source.setRawMode?.(mode);
      return proxy;
    },
    ref: () => {
      source.ref?.();
      return proxy;
    },
    unref: () => {
      source.unref?.();
      return proxy;
    }
  });
  return {
    stdin: proxy as unknown as NodeJS.ReadStream,
    subscribeWheel: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enableTracking: () => {
      if (output.isTTY) output.write("\x1b[?1002h\x1b[?1006h");
    },
    disableTracking: () => {
      if (output.isTTY) output.write("\x1b[?1006l\x1b[?1002l");
    },
    detach: () => {
      source.off("data", handleData);
      if (flushTimer) clearTimeout(flushTimer);
    }
  };
}
