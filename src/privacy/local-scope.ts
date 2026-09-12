import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { join } from "node:path";

import { canonicalApiOrigin, offlineScopeDigest } from "./export-canonical.js";

export interface LocalScopeEnvelope<T> {
  scopeDigest: string;
  ownerId: string;
  value: T;
}

export function localScopeDigest(apiBaseUrl: string, ownerId: string): string {
  return offlineScopeDigest(apiBaseUrl, ownerId);
}

export function localScopeKey(apiBaseUrl: string, ownerId: string): string {
  return localScopeDigest(apiBaseUrl, ownerId).slice(0, 32);
}
export function syncScopeKey(apiBaseUrl: string, ownerId: string): string {
  return createHash("sha256")
    .update(canonicalApiOrigin(apiBaseUrl))
    .update("\0")
    .update(ownerId)
    .digest("hex")
    .slice(0, 24);
}

export function scopedEnvelope<T>(
  apiBaseUrl: string,
  ownerId: string,
  value: T,
): LocalScopeEnvelope<T> {
  return { scopeDigest: localScopeDigest(apiBaseUrl, ownerId), ownerId, value };
}

export function requireScopedEnvelopeDigest<T>(
  value: unknown,
  scopeDigest: string,
  ownerId: string,
): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("本地数据范围信封无效");
  }
  const candidate = value as Partial<LocalScopeEnvelope<T>>;
  if (candidate.ownerId !== ownerId || candidate.scopeDigest !== scopeDigest ||
      !(("value" as keyof typeof candidate) in candidate)) {
    throw new Error("本地数据来源与当前 API 账号不匹配");
  }
  return candidate.value as T;
}

export function requireScopedEnvelope<T>(
  value: unknown,
  apiBaseUrl: string,
  ownerId: string,
): T {
  return requireScopedEnvelopeDigest(value, localScopeDigest(apiBaseUrl, ownerId), ownerId);
}

export function scopedDirectories(
  userDataRoot: string,
  rootName: string,
  apiBaseUrl: string,
  ownerId: string,
): { directory: string; legacyDirectory: string } {
  return {
    directory: join(userDataRoot, rootName, localScopeKey(apiBaseUrl, ownerId)),
    legacyDirectory: join(userDataRoot, rootName, legacyOwnerKey(ownerId)),
  };
}

export async function assertNoAmbiguousLegacyDirectory(
  legacyDirectory: string,
  scopedDirectory: string,
): Promise<void> {
  if (legacyDirectory === scopedDirectory) return;
  try {
    await stat(legacyDirectory);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error &&
        Reflect.get(error, "code") === "ENOENT") return;
    throw error;
  }
  throw new Error("检测到未绑定 API 来源的旧本地数据，已拒绝读取或覆盖");
}

export function legacyOwnerKey(ownerId: string, length = 20): string {
  return createHash("sha256").update(ownerId).digest("hex").slice(0, length);
}
