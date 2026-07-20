import {readFile} from "node:fs/promises";
import {readPngDimensions} from "./readPngDimensions.js";

export type FramePainterProtocol = "kitty" | "iterm2";

export interface FrameRegion {
  col: number;
  row: number;
  width: number;
  height: number;
  appHeight: number;
}

export interface FramePainter {
  submitFrame(path: string): void;
  setRegion(region: FrameRegion | undefined): void;
  repaint(): void;
  stop(): void;
}

interface PainterStdout {
  write(data: string): unknown;
  rows?: number | undefined;
}

const esc = String.fromCharCode(27);
const bel = String.fromCharCode(7);
const kittyChunkSize = 4096;
const kittyImageIds = [4041, 4042];

interface PlacementBox {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

function moveTo(
  box: {col: number; row: number},
  appHeight: number,
  terminalRows: number | undefined,
  payload: string
): string {
  const up =
    appHeight -
    box.row -
    (terminalRows !== undefined && appHeight >= terminalRows ? 1 : 0);
  let sequence = `${esc}7`;
  if (up > 0) sequence += `${esc}[${up}A`;
  sequence += "\r";
  if (box.col > 0) sequence += `${esc}[${box.col}C`;
  return `${sequence}${payload}${esc}8`;
}

function kittyTransmit(imageId: number, base64Data: string): string {
  if (base64Data.length <= kittyChunkSize) {
    return `${esc}_Gf=100,t=d,i=${imageId},m=0,q=2;${base64Data}${esc}\\`;
  }
  const chunks = [
    `${esc}_Gf=100,t=d,i=${imageId},m=1,q=2;${base64Data.slice(0, kittyChunkSize)}${esc}\\`
  ];
  let offset = kittyChunkSize;
  while (offset < base64Data.length - kittyChunkSize) {
    chunks.push(
      `${esc}_Gm=1,q=2;${base64Data.slice(offset, offset + kittyChunkSize)}${esc}\\`
    );
    offset += kittyChunkSize;
  }
  chunks.push(`${esc}_Gm=0,q=2;${base64Data.slice(offset)}${esc}\\`);
  return chunks.join("");
}

function kittyPlacement(imageId: number, box: PlacementBox): string {
  return `${esc}_Ga=p,i=${imageId},p=1,c=${box.cols},r=${box.rows},C=1,q=2${esc}\\`;
}

function kittyDeletion(imageId: number): string {
  return `${esc}_Ga=d,d=I,i=${imageId},q=2${esc}\\`;
}

function iterm2Payload(
  base64Data: string,
  byteLength: number,
  region: FrameRegion
): string {
  return `${esc}]1337;File=inline=1;size=${byteLength};width=${region.width};height=${region.height};preserveAspectRatio=1:${base64Data}${bel}`;
}

export function createFramePainter(options: {
  protocol: FramePainterProtocol;
  cellWidth: number;
  cellHeight: number;
  stdout: PainterStdout;
  onFirstFrame?(): void;
}): FramePainter {
  const {protocol, cellWidth, cellHeight, stdout} = options;
  let region: FrameRegion | undefined;
  let pendingPath: string | undefined;
  let painting = false;
  let stopped = false;
  let live = false;
  let frameCount = 0;
  let activeKittyId: number | undefined;
  let activeKittyBox: {cols: number; rows: number} | undefined;
  let activeIterm2: {base64Data: string; byteLength: number} | undefined;

  const containBox = (
    image: {width: number; height: number},
    target: FrameRegion
  ): PlacementBox => {
    const scale = Math.min(
      (target.width * cellWidth) / image.width,
      (target.height * cellHeight) / image.height
    );
    const cols = Math.min(
      target.width,
      Math.max(1, Math.round((image.width * scale) / cellWidth))
    );
    const rows = Math.min(
      target.height,
      Math.max(1, Math.round((image.height * scale) / cellHeight))
    );
    return {
      cols,
      rows,
      col: target.col + Math.floor((target.width - cols) / 2),
      row: target.row + Math.floor((target.height - rows) / 2)
    };
  };

  const paintFrame = async (path: string): Promise<void> => {
    const target = region;
    if (!target) return;
    const bytes = new Uint8Array(await readFile(path));
    const base64Data = Buffer.from(bytes).toString("base64");
    if (protocol === "kitty") {
      const box = containBox(readPngDimensions(bytes), target);
      const previousId = activeKittyId;
      const imageId = kittyImageIds[frameCount % kittyImageIds.length] ?? 4041;
      frameCount += 1;
      stdout.write(
        kittyTransmit(imageId, base64Data) +
          moveTo(
            box,
            target.appHeight,
            stdout.rows,
            kittyPlacement(imageId, box)
          ) +
          (previousId !== undefined && previousId !== imageId
            ? kittyDeletion(previousId)
            : "")
      );
      activeKittyId = imageId;
      activeKittyBox = {cols: box.cols, rows: box.rows};
    } else {
      activeIterm2 = {base64Data, byteLength: bytes.byteLength};
      stdout.write(
        moveTo(
          target,
          target.appHeight,
          stdout.rows,
          iterm2Payload(base64Data, bytes.byteLength, target)
        )
      );
    }
    if (!live) {
      live = true;
      options.onFirstFrame?.();
    }
  };

  const drain = (): void => {
    if (painting || stopped || !region || !pendingPath) return;
    painting = true;
    void (async () => {
      try {
        while (!stopped && region && pendingPath) {
          const path = pendingPath;
          pendingPath = undefined;
          await paintFrame(path).catch(() => {});
        }
      } finally {
        painting = false;
      }
    })();
  };

  return {
    submitFrame(path: string): void {
      if (stopped) return;
      pendingPath = path;
      drain();
    },
    setRegion(next: FrameRegion | undefined): void {
      region = next && next.width > 0 && next.height > 0 ? next : undefined;
      drain();
    },
    repaint(): void {
      if (stopped || !region || !live) return;
      if (protocol === "kitty") {
        if (activeKittyId === undefined || !activeKittyBox) return;
        const box: PlacementBox = {
          ...activeKittyBox,
          col:
            region.col + Math.floor((region.width - activeKittyBox.cols) / 2),
          row:
            region.row + Math.floor((region.height - activeKittyBox.rows) / 2)
        };
        stdout.write(
          moveTo(
            box,
            region.appHeight,
            stdout.rows,
            kittyPlacement(activeKittyId, box)
          )
        );
      } else if (activeIterm2) {
        stdout.write(
          moveTo(
            region,
            region.appHeight,
            stdout.rows,
            iterm2Payload(
              activeIterm2.base64Data,
              activeIterm2.byteLength,
              region
            )
          )
        );
      }
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      pendingPath = undefined;
      if (protocol === "kitty" && activeKittyId !== undefined) {
        stdout.write(kittyDeletion(activeKittyId));
      }
    }
  };
}
