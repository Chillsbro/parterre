import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";

export function getAdapterRoot(): string {
  return join(homedir(), ".parterre", "adapters");
}

function getAdapterRequire() {
  return createRequire(resolve(getAdapterRoot(), "package.json"));
}

export async function loadAdapterModule<T>(specifier: string): Promise<T> {
  const require = getAdapterRequire();
  const moduleUrl = pathToFileURL(require.resolve(specifier)).href;
  return import(moduleUrl) as Promise<T>;
}

export function resolveAdapterModule(specifier: string): string {
  const require = getAdapterRequire();
  return require.resolve(specifier);
}
