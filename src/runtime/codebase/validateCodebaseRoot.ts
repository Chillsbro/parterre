import {statSync} from "node:fs";
import {homedir} from "node:os";
import {parse, resolve} from "node:path";

export function validateCodebaseRoot(path: string): void {
  if (path === parse(path).root || path === resolve(homedir())) {
    throw new Error(
      `Refusing to authorize a codebase root this broad: ${path}`
    );
  }
  if (!statSync(path, {throwIfNoEntry: false})?.isDirectory()) {
    throw new Error(`Codebase root is not a directory: ${path}`);
  }
}
