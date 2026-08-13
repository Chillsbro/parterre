#!/usr/bin/env bun
import {dlopen} from "bun:ffi";
import {platform} from "node:os";

const [leftPath, rightPath] = Bun.argv.slice(2);
if (!leftPath || !rightPath) {
  throw new Error("atomic-swap requires two directory paths");
}

const toCString = value => Buffer.from(`${value}\0`);
const left = toCString(leftPath);
const right = toCString(rightPath);

let result;
let library;
if (platform() === "linux") {
  library = dlopen("libc.so.6", {
    renameat2: {
      args: ["i32", "ptr", "i32", "ptr", "u32"],
      returns: "i32"
    }
  });
  const atCurrentWorkingDirectory = -100;
  const renameExchange = 2;
  result = library.symbols.renameat2(
    atCurrentWorkingDirectory,
    left,
    atCurrentWorkingDirectory,
    right,
    renameExchange
  );
} else if (platform() === "darwin") {
  library = dlopen("/usr/lib/libSystem.B.dylib", {
    renamex_np: {
      args: ["ptr", "ptr", "u32"],
      returns: "i32"
    }
  });
  const renameSwap = 2;
  result = library.symbols.renamex_np(left, right, renameSwap);
} else {
  throw new Error(`Atomic directory exchange is unsupported on ${platform()}`);
}

library.close();
if (result !== 0) {
  throw new Error("Atomic directory exchange failed");
}
