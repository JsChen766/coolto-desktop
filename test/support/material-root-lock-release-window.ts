import { readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { materialRootLockMarkerPath } from "../../src/material/material-root-lock.js";

const [lock, token, ready, proceed] = process.argv.slice(2);
if (!lock || !token || !ready || !proceed) throw new Error("release-window child requires lock, token, ready, and proceed paths");

const marker = materialRootLockMarkerPath(lock, token);
await readFile(marker, "utf8");
await writeFile(ready, "observed", "utf8");
while (!await stat(proceed).then(() => true).catch(() => false)) await new Promise((resolve) => setTimeout(resolve, 5));
try { await rename(marker, join(lock, `.retired-test-${token}.json`)); }
catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
await rmdir(lock).catch(() => undefined);
