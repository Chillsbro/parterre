const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

export interface PngDimensions {
  width: number;
  height: number;
}

export function readPngDimensions(bytes: Uint8Array): PngDimensions {
  if (
    bytes.length < 24 ||
    pngSignature.some((value, index) => bytes[index] !== value)
  ) {
    throw new Error("Not a PNG file");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {width: view.getUint32(16), height: view.getUint32(20)};
}
