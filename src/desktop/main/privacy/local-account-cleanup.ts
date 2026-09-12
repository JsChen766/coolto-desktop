import { lstat, realpath, rm, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { app } from "electron";

import { legacyOwnerKey, localScopeKey, syncScopeKey } from "../../../privacy/local-scope.js";

export interface AccountLocalPath {
  rootName: string;
  path: string;
  kind: "file" | "directory";
}

export function accountLocalPaths(
  apiBaseUrl: string,
  ownerId: string,
  userDataRoot: string,
): AccountLocalPath[] {
  const root = resolve(userDataRoot);
  const scope = localScopeKey(apiBaseUrl, ownerId);
  return [
    ...["conversations", "resume-drafts", "agent-harness", "agent-evidence",
      "calendar-links", "mail-connections", "delivery-resume-files",
      "managed-resume-uploads", "onboarding-demo"]
      .map((rootName) => ({ rootName, path: join(root, rootName, scope), kind: "directory" as const })),
    { rootName: "sync", path: join(root, "sync", syncScopeKey(apiBaseUrl, ownerId)), kind: "directory" },
    { rootName: "onboarding", path: join(root, "onboarding", `${scope}.coolto`), kind: "file" },
  ];
}

export async function clearAccountLocalDirectories(apiBaseUrl: string, ownerId: string): Promise<void> {
  const userDataRoot = resolve(app.getPath("userData"));
  await assertNoAmbiguousLegacyData(apiBaseUrl, ownerId, userDataRoot);
  const failures: string[] = [];
  for (const entry of accountLocalPaths(apiBaseUrl, ownerId, userDataRoot)) {
    try { await removeOwnedPath(userDataRoot, entry); } catch { failures.push(entry.rootName); }
  }
  if (failures.length > 0) throw new Error("本机账号数据仍有目录未清除");
}

async function assertNoAmbiguousLegacyData(apiBaseUrl: string, ownerId: string, root: string): Promise<void> {
  const legacy20 = legacyOwnerKey(ownerId, 20);
  const legacy32 = legacyOwnerKey(ownerId, 32);
  const roots = ["conversations", "resume-drafts", "agent-harness", "agent-evidence", "mail-connections",
    "delivery-resume-files", "managed-resume-uploads", "onboarding-demo"];
  const paths = roots.map((name) => join(root, name, legacy20));
  paths.push(join(root, "calendar-links", legacy32), join(root, "onboarding", `${legacy20}.coolto`));
  for (const path of paths) {
    try { await stat(path); } catch (error: unknown) {
      if (isMissing(error)) continue;
      throw error;
    }
    throw new Error(`检测到未绑定 API 来源的旧本地数据：${path}`);
  }
}

async function removeOwnedPath(userDataRoot: string, entry: AccountLocalPath): Promise<void> {
  const root = resolve(userDataRoot, entry.rootName);
  const rootReal = await existingRealPath(root);
  if (!rootReal) return;
  if (!samePath(root, rootReal)) throw new Error("本地账号目录不是应用拥有的目录");
  const target = resolve(entry.path);
  assertChild(rootReal, target);
  const info = await lstat(target).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error("拒绝删除链接目标");
  if (entry.kind === "directory" ? !info.isDirectory() : !info.isFile()) {
    throw new Error("本地账号路径类型无效");
  }
  const targetReal = await realpath(target);
  assertChild(rootReal, targetReal);
  if (!samePath(target, targetReal)) throw new Error("拒绝删除链接目标");
  await rm(target, { recursive: entry.kind === "directory", force: true });
}

function assertChild(root: string, target: string): void {
  const child = relative(resolve(root), resolve(target));
  if (!child || child === ".." || child.startsWith(`..${sep}`)) throw new Error("本地账号路径越界");
}
async function existingRealPath(path: string): Promise<string | undefined> {
  try { return await realpath(path); } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}
function samePath(left: string, right: string): boolean {
  const values = [resolve(left), resolve(right)];
  return process.platform === "win32" ? values[0]!.toLowerCase() === values[1]!.toLowerCase() : values[0] === values[1];
}
function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && Reflect.get(error, "code") === "ENOENT");
}
