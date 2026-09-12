import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withMaterialRootLock } from "../../src/material/material-root-lock.js";

const [lock, activeRoot, contender] = process.argv.slice(2);
if (!lock || !activeRoot || !contender) throw new Error("root-lock contender requires lock, active root, and id");

await mkdir(activeRoot, { recursive: true });
await withMaterialRootLock(lock, async () => {
  const active = join(activeRoot, contender);
  await writeFile(active, "active", { flag: "wx" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await rm(active, { force: true });
});
