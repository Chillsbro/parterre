import {mkdirSync, writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {getUserConfigPath, type UserConfig} from "./readUserConfig.js";

export function writeUserConfig(
  config: UserConfig,
  configPath = getUserConfigPath()
): void {
  mkdirSync(dirname(configPath), {recursive: true});
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}
