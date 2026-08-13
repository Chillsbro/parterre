export interface TerminalGraphicsInfo {
  cellWidth: number;
  cellHeight: number;
  terminalWidth: number;
  terminalHeight: number;
  supportsKittyGraphics: boolean;
}

const cellSizeRegex = /\x1b\[6;(\d+);(\d+);?t/;
const textAreaSizeRegex = /\x1b\[4;(\d+);(\d+);?t/;
const kittyRegex = /\x1b_Gi=31;(.+?)\x1b\\/;
const sentinelRegex = /\x1b\[\?(\d+(?:;\d+)*)c/;

function decodeChunk(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) {
    return Buffer.from(
      chunk.buffer,
      chunk.byteOffset,
      chunk.byteLength
    ).toString();
  }
  return String(chunk);
}

export function probeTerminalGraphics(
  timeoutMs = 800
): Promise<TerminalGraphicsInfo> {
  const fallback: TerminalGraphicsInfo = {
    cellWidth: 10,
    cellHeight: 20,
    terminalWidth: 10 * (process.stdout.columns ?? 80),
    terminalHeight: 20 * (process.stdout.rows ?? 24),
    supportsKittyGraphics: false
  };
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    process.env.PARTERRE_SKIP_PROBE === "1"
  ) {
    return Promise.resolve(fallback);
  }
  return new Promise(resolve => {
    let buffer = "";
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.removeListener("readable", onReadable);
      process.stdin.setRawMode?.(false);
      process.stdin.unref();
      const cellMatch = buffer.match(cellSizeRegex);
      const textAreaMatch = buffer.match(textAreaSizeRegex);
      const info: TerminalGraphicsInfo = {...fallback};
      if (cellMatch?.[1] && cellMatch?.[2]) {
        info.cellHeight = Number.parseInt(cellMatch[1], 10) || info.cellHeight;
        info.cellWidth = Number.parseInt(cellMatch[2], 10) || info.cellWidth;
      } else if (textAreaMatch?.[1] && textAreaMatch?.[2]) {
        const areaHeight = Number.parseInt(textAreaMatch[1], 10);
        const areaWidth = Number.parseInt(textAreaMatch[2], 10);
        const columns = process.stdout.columns ?? 80;
        const rows = process.stdout.rows ?? 24;
        if (areaHeight > 0 && areaWidth > 0) {
          info.cellHeight = Math.floor(areaHeight / rows) || info.cellHeight;
          info.cellWidth = Math.floor(areaWidth / columns) || info.cellWidth;
        }
      }
      info.supportsKittyGraphics =
        kittyRegex.exec(buffer)?.[1]?.includes("OK") ?? false;
      info.terminalWidth = info.cellWidth * (process.stdout.columns ?? 80);
      info.terminalHeight = info.cellHeight * (process.stdout.rows ?? 24);
      resolve(info);
    };
    const onReadable = (): void => {
      while (true) {
        const chunk: unknown = process.stdin.read();
        if (chunk === null) break;
        buffer += decodeChunk(chunk);
      }
      if (sentinelRegex.test(buffer)) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.ref();
    process.stdin.setRawMode?.(true);
    process.stdin.addListener("readable", onReadable);
    process.stdout.write(
      "\x1b[16t" +
        "\x1b[14t" +
        "\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\" +
        "\x1b[c"
    );
  });
}
