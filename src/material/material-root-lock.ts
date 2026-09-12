import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rmdir, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface MaterialRootLockEntry { pid: number; token: string; acquiredAt: string; }
export const MATERIAL_ROOT_LOCK_STALE_MS = 30_000;
const OWNER_NAME = /^owner-([a-f0-9-]{36})\.json$/u;

/** A live PID is never age-reclaimed: PID reuse can wedge this local lock, but cannot steal it. */
export function materialOwnerRootLockPath(root: string): string {
  return join(dirname(root), `.${basename(root)}.material.lock`);
}

export function materialRootLockMarkerPath(lock: string, token: string): string {
  return join(lock, `owner-${token}.json`);
}

/** Directory creation is atomic; every release/reclaim targets the observed token marker, never the stable directory path. */
export async function withMaterialRootLock<T>(lock: string, operation: () => Promise<T>, timeoutMs = 15_000): Promise<T> {
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const token = randomUUID();
    let created = false;
    try { await mkdir(lock, { mode: 0o700 }); created = true; }
    catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    if (created && await claimNewDirectory(lock, token)) {
      try { return await operation(); }
      finally { await releaseMaterialRootLock(lock, token); }
    }
    if (await reclaimMaterialRootLock(lock)) continue;
    if (Date.now() >= deadline) throw new Error("材料本地锁繁忙，请稍后重试");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function canReclaimMaterialRootLock(payload: string, mtimeMs: number, nowMs: number, alive: (pid: number) => boolean = isPidAlive): boolean {
  const entry = parseLock(payload);
  if (entry) return !alive(entry.pid);
  return nowMs - mtimeMs > MATERIAL_ROOT_LOCK_STALE_MS;
}

/** One recovery step only renames/unlinks an exact observed marker, then nonrecursively removes an empty directory. */
export async function reclaimMaterialRootLock(lock: string, nowMs = Date.now(), alive: (pid: number) => boolean = isPidAlive): Promise<boolean> {
  const directory = await stat(lock).catch((error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  });
  if (!directory) return true;
  if (!directory.isDirectory()) return false;
  const entries = await readdir(lock, { withFileTypes: true }).catch((error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  });
  if (!entries) return true;
  if (entries.length === 0) return stale(directory.mtimeMs, nowMs) ? removeEmptyDirectory(lock) : false;
  for (const item of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!item.isFile()) return false;
    const marker = join(lock, item.name);
    const payload = await readFile(marker, "utf8").catch((error: unknown) => {
      if (missing(error)) return undefined;
      throw error;
    });
    if (payload === undefined) return true;
    const entry = parseLock(payload);
    const ownerToken = ownerTokenFromName(item.name);
    if (entry && ownerToken === entry.token) {
      if (alive(entry.pid)) return false;
      return retireMarker(lock, marker, entry.token, "reclaim");
    }
    if (entry && alive(entry.pid)) return false;
    if (!entry && !stale(directory.mtimeMs, nowMs)) return false;
    return retireMarker(lock, marker, entry?.token ?? randomUUID(), "malformed");
  }
  return false;
}

export async function releaseMaterialRootLock(lock: string, token: string): Promise<void> {
  const marker = materialRootLockMarkerPath(lock, token);
  const payload = await readFile(marker, "utf8").catch((error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  });
  if (payload === undefined || parseLock(payload)?.token !== token) return;
  await retireMarker(lock, marker, token, "release");
}

async function claimNewDirectory(lock: string, token: string): Promise<boolean> {
  const marker = materialRootLockMarkerPath(lock, token);
  const entry: MaterialRootLockEntry = { pid: process.pid, token, acquiredAt: new Date().toISOString() };
  let handle;
  try { handle = await open(marker, "wx", 0o600); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST" || (error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  try { await handle.writeFile(JSON.stringify(entry), "utf8"); await handle.sync(); }
  finally { await handle.close().catch(() => undefined); }
  const entries = await readdir(lock, { withFileTypes: true }).catch((error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  });
  if (entries?.length === 1 && entries[0]?.isFile() && entries[0].name === basename(marker)) return true;
  await releaseMaterialRootLock(lock, token);
  return false;
}

async function retireMarker(lock: string, marker: string, token: string, phase: string): Promise<boolean> {
  const retired = join(lock, `.retired-${phase}-${token}-${randomUUID()}.json`);
  try { await rename(marker, retired); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  await unlink(retired).catch((error: unknown) => { if (!missing(error)) throw error; });
  await removeEmptyDirectory(lock);
  return true;
}

async function removeEmptyDirectory(lock: string): Promise<boolean> {
  try { await rmdir(lock); return true; }
  catch { return false; }
}

function stale(mtimeMs: number, nowMs: number): boolean { return nowMs - mtimeMs > MATERIAL_ROOT_LOCK_STALE_MS; }
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
function ownerTokenFromName(name: string): string | undefined { return OWNER_NAME.exec(name)?.[1]; }
function parseLock(payload: string): MaterialRootLockEntry | undefined {
  try {
    const value = JSON.parse(payload) as Partial<MaterialRootLockEntry>;
    if (Number.isSafeInteger(value.pid) && value.pid! > 0 && typeof value.token === "string" && /^[a-f0-9-]{36}$/u.test(value.token)
      && typeof value.acquiredAt === "string" && Number.isFinite(Date.parse(value.acquiredAt))) return { pid: value.pid!, token: value.token, acquiredAt: value.acquiredAt };
  } catch { /* malformed entries only follow the bounded stale path */ }
  return undefined;
}
function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error: unknown) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}
