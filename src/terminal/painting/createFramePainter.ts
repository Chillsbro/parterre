import {readFile} from "node:fs/promises";
import {readPngDimensions} from "./readPngDimensions.js";

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
  suspend(): void;
  resume(): void;
  repaint(): void;
  stop(): void;
}

interface PainterStdout {
  write(data: string): unknown;
  rows?: number | undefined;
}

interface PlacementBox {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

const esc = String.fromCharCode(27);
const kittyChunkSize = 4096;
const kittyImageIds = [4041, 4042];

function moveTo(
  box: {col: number; row: number},
  appHeight: number,
  terminalRows: number | undefined,
  payload: string,
  positioning: "relative" | "absolute"
): string {
  if (positioning === "absolute") {
    return `${esc}7${esc}[${box.row + 1};${box.col + 1}H${payload}${esc}8`;
  }
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

function clearRegion(region: FrameRegion): string {
  const rows = Array.from(
    {length: region.height},
    (_, offset) =>
      `${esc}[${region.row + offset + 1};${region.col + 1}H${" ".repeat(region.width)}`
  ).join("");
  return `${esc}7${rows}${esc}8`;
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

function kittyPlacementDeletion(imageId: number): string {
  return `${esc}_Ga=d,d=i,i=${imageId},p=1,q=2${esc}\\`;
}

export function createFramePainter(options: {
  cellWidth: number;
  cellHeight: number;
  stdout: PainterStdout;
  positioning?: "relative" | "absolute";
}): FramePainter {
  const {cellWidth, cellHeight, stdout} = options;
  const positioning = options.positioning ?? "relative";
  let region: FrameRegion | undefined;
  let pendingPath: string | undefined;
  let latestPath: string | undefined;
  let paintedPath: string | undefined;
  let painting = false;
  let stopped = false;
  let suspended = false;
  let generation = 0;
  let frameCount = 0;
  let activeImageId: number | undefined;
  let activeBox: {cols: number; rows: number} | undefined;

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

  const placeActive = (): void => {
    if (!region || activeImageId === undefined || !activeBox) return;
    const box: PlacementBox = {
      ...activeBox,
      col: region.col + Math.floor((region.width - activeBox.cols) / 2),
      row: region.row + Math.floor((region.height - activeBox.rows) / 2)
    };
    stdout.write(
      moveTo(
        box,
        region.appHeight,
        stdout.rows,
        kittyPlacement(activeImageId, box),
        positioning
      )
    );
  };

  const paintFrame = async (path: string): Promise<void> => {
    const target = region;
    if (!target) return;
    const targetGeneration = generation;
    const bytes = new Uint8Array(await readFile(path));
    if (
      stopped ||
      suspended ||
      region !== target ||
      generation !== targetGeneration
    ) {
      return;
    }
    const box = containBox(readPngDimensions(bytes), target);
    const previousId = activeImageId;
    const imageId = kittyImageIds[frameCount % kittyImageIds.length] ?? 4041;
    frameCount += 1;
    stdout.write(
      kittyTransmit(imageId, Buffer.from(bytes).toString("base64")) +
        moveTo(
          box,
          target.appHeight,
          stdout.rows,
          kittyPlacement(imageId, box),
          positioning
        ) +
        (previousId !== undefined && previousId !== imageId
          ? kittyDeletion(previousId)
          : "")
    );
    activeImageId = imageId;
    activeBox = {cols: box.cols, rows: box.rows};
    paintedPath = path;
  };

  const drain = (): void => {
    if (painting || stopped || suspended || !region || !pendingPath) return;
    painting = true;
    void (async () => {
      try {
        while (!stopped && !suspended && region && pendingPath) {
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
    submitFrame(path): void {
      if (stopped) return;
      latestPath = path;
      pendingPath = path;
      drain();
    },
    setRegion(next): void {
      const valid =
        next && next.width > 0 && next.height > 0 ? next : undefined;
      if (
        region?.col === valid?.col &&
        region?.row === valid?.row &&
        region?.width === valid?.width &&
        region?.height === valid?.height &&
        region?.appHeight === valid?.appHeight
      ) {
        return;
      }
      const previous = region;
      region = valid;
      generation += 1;
      if (!region) {
        pendingPath = undefined;
        if (activeImageId !== undefined) {
          stdout.write(kittyDeletion(activeImageId));
          activeImageId = undefined;
          activeBox = undefined;
        }
        if (positioning === "absolute" && previous) {
          stdout.write(clearRegion(previous));
        }
        return;
      }
      if (!previous && latestPath) pendingPath = latestPath;
      drain();
    },
    suspend(): void {
      if (stopped || suspended) return;
      suspended = true;
      generation += 1;
      pendingPath = undefined;
      if (activeImageId !== undefined) {
        stdout.write(kittyPlacementDeletion(activeImageId));
      }
      if (positioning === "absolute" && region) {
        stdout.write(clearRegion(region));
      }
    },
    resume(): void {
      if (stopped || !suspended) return;
      suspended = false;
      generation += 1;
      if (latestPath && latestPath !== paintedPath) pendingPath = latestPath;
      if (pendingPath) drain();
      else placeActive();
    },
    repaint(): void {
      if (stopped || suspended || activeImageId === undefined) return;
      placeActive();
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      generation += 1;
      pendingPath = undefined;
      if (activeImageId !== undefined) {
        stdout.write(kittyDeletion(activeImageId));
      }
    }
  };
}
