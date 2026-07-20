import {resolve} from "node:path";
import {openSessionDatabase} from "../storage/openSessionDatabase.js";

export async function clearCodebaseProfile(
  storageDir: string,
  path: string
): Promise<void> {
  const resolvedPath = resolve(path);
  const database = openSessionDatabase(storageDir);
  const clear = database.transaction(() => {
    database
      .query("DELETE FROM codebase_profile_entries WHERE path = $path")
      .run({$path: resolvedPath});
    database
      .query("DELETE FROM codebase_profiles WHERE path = $path")
      .run({$path: resolvedPath});
  });
  clear();
}
