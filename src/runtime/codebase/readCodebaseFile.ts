import {readFileSync, statSync} from "node:fs";
import {codebaseReadMaxBytes} from "./limits.js";
import type {ReadCodebaseResult} from "./types.js";

export function readCodebaseFile(target: string): ReadCodebaseResult {
  try {
    const stats = statSync(target);
    if (!stats.isFile()) return {ok: false, error: `Not a file: ${target}`};
    const buffer = readFileSync(target);
    const truncated = buffer.byteLength > codebaseReadMaxBytes;
    const text = buffer.subarray(0, codebaseReadMaxBytes).toString("utf8");
    return {
      ok: true,
      output: truncated
        ? `${text}\n\n[truncated at ${codebaseReadMaxBytes} bytes]`
        : text
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
