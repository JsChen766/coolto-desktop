import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { MaterialCatalogEntry } from "./material-repository.js";

const DIRECTORIES = ["records", "raw"] as const;

export async function recoverMaterialRepositoryFiles(
  root: string,
  catalog: Map<string, MaterialCatalogEntry>,
): Promise<boolean> {
  let changed = false;
  for (const id of [...catalog.keys()]) {
    const recordPath = join(root, "records", `${id}.enc`);
    const rawPath = join(root, "raw", `${id}.bin`);
    if (!(await isRegularFile(recordPath)) || !(await isRegularFile(rawPath))) {
      catalog.delete(id);
      changed = true;
    }
  }
  for (const directory of DIRECTORIES) {
    const path = join(root, directory);
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const suffix = directory === "records" ? ".enc" : ".bin";
      if (!entry.name.endsWith(suffix) || entry.name.includes(".tmp")) {
        await rm(join(path, entry.name), { force: true });
        changed = true;
        continue;
      }
      const id = entry.name.slice(0, -suffix.length);
      if (!catalog.has(id)) {
        await rm(join(path, entry.name), { force: true });
        changed = true;
      }
    }
  }
  return changed;
}

async function isRegularFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
