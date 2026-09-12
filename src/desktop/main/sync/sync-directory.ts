import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function assertOwnedSyncDirectory(
  syncRoot: string,
  accountDirectory: string,
): void {
  const root = resolve(syncRoot);
  const target = resolve(accountDirectory);
  const child = relative(root, target);
  if (!child || isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`) || child.includes(`${sep}${sep}`)) {
    throw new Error("拒绝删除同步根目录之外的本地数据");
  }
  if (child.includes(sep)) {
    throw new Error("拒绝删除非账号级同步目录");
  }
}
export async function assertOwnedSyncDirectoryTarget(
  syncRoot: string,
  accountDirectory: string,
): Promise<void> {
  assertOwnedSyncDirectory(syncRoot, accountDirectory);
  const rootReal = await existingRealPath(syncRoot);
  if (!rootReal) return;
  if (!samePath(syncRoot, rootReal)) {
    throw new Error("拒绝删除链接同步根目录");
  }
  const info = await lstat(accountDirectory).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error("拒绝删除链接同步目录");
  const targetReal = await realpath(accountDirectory);
  assertOwnedSyncDirectory(rootReal, targetReal);
  if (!samePath(accountDirectory, targetReal)) {
    throw new Error("拒绝删除链接同步目录");
  }
}

async function existingRealPath(path: string): Promise<string | undefined> {
  try { return await realpath(path); } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function samePath(left: string, right: string): boolean {
  const values = [resolve(left), resolve(right)];
  return process.platform === "win32"
    ? values[0]!.toLowerCase() === values[1]!.toLowerCase()
    : values[0] === values[1];
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT";
}
