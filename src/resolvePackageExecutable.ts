import {createRequire} from "node:module";
import {dirname, resolve} from "node:path";

const require = createRequire(import.meta.url);

export function resolvePackageExecutable(
  packageName: string,
  executablePath: string
): string {
  return resolve(
    dirname(require.resolve(`${packageName}/package.json`)),
    executablePath
  );
}
