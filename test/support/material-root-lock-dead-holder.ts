import { writeFile } from "node:fs/promises";

import { withMaterialRootLock } from "../../src/material/material-root-lock.js";

const [lock, ready] = process.argv.slice(2);
if (!lock || !ready) throw new Error("dead holder requires lock and ready paths");

await withMaterialRootLock(lock, async () => {
  await writeFile(ready, "locked", "utf8");
  await new Promise<void>(() => { setInterval(() => undefined, 1_000); });
});
