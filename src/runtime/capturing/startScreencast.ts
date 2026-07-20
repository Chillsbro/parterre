import {mkdir, readFile, rename, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {getSessionPath} from "../../sessions/index.js";

export interface ScreencastHandle {
  retarget(url?: string): Promise<void>;
  stop(): void;
}

interface CdpPageTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

const frameAckDelayMs = 100;
const frameQuality = 55;
const maxFrameWidth = 1280;
const maxFrameHeight = 800;
const endpointRetries = 5;
const endpointRetryDelayMs = 200;
const reconnectRetries = 3;
const reconnectDelayMs = 300;
const connectTimeoutMs = 5000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readDebuggingPort(profilePath: string): Promise<number> {
  const endpointFile = join(profilePath, "DevToolsActivePort");
  for (let attempt = 0; attempt < endpointRetries; attempt += 1) {
    const content = await readFile(endpointFile, "utf8").catch(() => "");
    const port = Number.parseInt(content.split("\n")[0] ?? "", 10);
    if (Number.isInteger(port) && port > 0) return port;
    await delay(endpointRetryDelayMs);
  }
  throw new Error(`No debugging port published at ${endpointFile}`);
}

export async function startScreencast(options: {
  storageDir: string;
  sessionId: string;
  format?: "png" | "jpeg";
  onFrame(path: string): void;
  onEnd(): void;
}): Promise<ScreencastHandle> {
  const format = options.format ?? "jpeg";
  const sessionPath = getSessionPath(options.storageDir, options.sessionId);
  const port = await readDebuggingPort(join(sessionPath, "browser-profile"));
  const framesDir = join(sessionPath, "live-frames");
  await mkdir(framesDir, {recursive: true});

  let socket: WebSocket | undefined;
  let frameNumber = 0;
  let commandId = 0;
  let stopped = false;
  let ended = false;

  const finish = (): void => {
    if (stopped || ended) return;
    ended = true;
    options.onEnd();
  };

  const send = (target: WebSocket, method: string, params: object): void => {
    commandId += 1;
    try {
      target.send(JSON.stringify({id: commandId, method, params}));
    } catch {}
  };

  const listPages = async (): Promise<CdpPageTarget[]> => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = (await response.json()) as CdpPageTarget[];
    return targets.filter(
      target => target.type === "page" && target.webSocketDebuggerUrl
    );
  };

  const handleFrame = (
    source: WebSocket,
    params: {data: string; sessionId: number}
  ): void => {
    frameNumber += 1;
    const currentFrame = frameNumber;
    void (async () => {
      const framePath = join(framesDir, `frame-${currentFrame}.${format}`);
      await writeFile(`${framePath}.tmp`, Buffer.from(params.data, "base64"));
      await rename(`${framePath}.tmp`, framePath);
      if (!stopped && socket === source) options.onFrame(framePath);
      void rm(join(framesDir, `frame-${currentFrame - 2}.${format}`), {
        force: true
      });
    })().catch(() => {});
    setTimeout(() => {
      send(source, "Page.screencastFrameAck", {sessionId: params.sessionId});
    }, frameAckDelayMs);
  };

  const connect = async (url?: string): Promise<void> => {
    const pages = await listPages();
    const target = (url && pages.find(page => page.url === url)) || pages[0];
    if (!target) throw new Error("No page targets available for the live view");
    const next = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out reaching ${target.url}`)),
        connectTimeoutMs
      );
      next.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      next.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Cannot reach page target for ${target.url}`));
      };
    });
    const previous = socket;
    socket = next;
    if (previous) {
      previous.onclose = null;
      previous.close();
    }
    next.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.method === "Page.screencastFrame") {
          handleFrame(next, message.params);
        }
      } catch {}
    };
    next.onclose = () => {
      if (stopped || socket !== next) return;
      void reconnect();
    };
    send(next, "Page.startScreencast", {
      format,
      ...(format === "jpeg" ? {quality: frameQuality} : {}),
      maxWidth: maxFrameWidth,
      maxHeight: maxFrameHeight
    });
  };

  const reconnect = async (): Promise<void> => {
    for (let attempt = 0; attempt < reconnectRetries; attempt += 1) {
      await delay(reconnectDelayMs);
      if (stopped) return;
      try {
        await connect();
        return;
      } catch {}
    }
    finish();
  };

  await connect();

  return {
    async retarget(url?: string): Promise<void> {
      if (stopped) return;
      try {
        await connect(url);
      } catch {}
    },
    stop(): void {
      stopped = true;
      const current = socket;
      socket = undefined;
      if (current) {
        current.onclose = null;
        try {
          current.close();
        } catch {}
      }
      void rm(framesDir, {recursive: true, force: true});
    }
  };
}
