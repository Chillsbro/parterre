import {homedir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

export function getAdapterRoot(): string {
  return join(homedir(), ".parterre", "adapters");
}

function resolveAdapterModuleUrl(specifier: string, root: string): string {
  const parentUrl = pathToFileURL(resolve(root, "resolver.js")).href;
  return import.meta.resolve(specifier, parentUrl);
}

export async function loadAdapterModule<T>(
  specifier: string,
  root = getAdapterRoot()
): Promise<T> {
  const moduleUrl = resolveAdapterModuleUrl(specifier, root);
  return import(moduleUrl) as Promise<T>;
}

export function resolveAdapterModule(
  specifier: string,
  root = getAdapterRoot()
): string {
  return fileURLToPath(resolveAdapterModuleUrl(specifier, root));
}
