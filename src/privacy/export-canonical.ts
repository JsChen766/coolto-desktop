import { createHash } from "node:crypto";

import type { CloudExportSnapshotV1 } from "./types.js";
import type {
  ExportManifestBody,
  ExportManifestEntry,
  ExportScope,
  ExportSnapshotView,
} from "./export-types.js";

export function offlineScopeDigest(apiBaseUrl: string, ownerId: string): string {
  const origin = canonicalApiOrigin(apiBaseUrl);
  if (!ownerId.trim()) throw new Error("导出缺少账号范围");
  return createHash("sha256")
    .update("coolto-export-offline-local-only-v2\0", "utf8")
    .update(origin, "utf8")
    .update("\0", "utf8")
    .update(ownerId, "utf8")
    .digest("hex");
}

export const MANDATORY_EXPORT_EXCLUSIONS = [
  ["access_token", "Never exported"],
  ["session_cookie", "Never exported"],
  ["refresh_token", "Never exported"],
  ["oauth_access_token", "Never exported"],
  ["password", "Never exported"],
  ["password_hash", "Never exported"],
  ["otp", "Never exported"],
  ["api_key", "Never exported"],
  ["encryption_key", "Never exported"],
  ["passphrase", "Never exported"],
  ["auth_session_store", "Never exported"],
  ["device_identity_store", "Never exported"],
  ["browser_cookies", "Never exported"],
  ["browser_cache", "Never exported"],
  ["browser_localstorage", "Never exported"],
  ["browser_dom", "Never exported"],
  ["browser_downloads", "Never exported"],
  ["browser_login_state", "Never exported"],
  ["mail_connection_secret", "Never exported"],
  ["mail_access_token", "Never exported"],
  ["agent_grant", "Never exported"],
  ["action_token", "Never exported"],
  ["browser_write_token", "Never exported"],
  ["internal_continuation", "Never exported"],
  ["private_key", "Never exported"],
  ["absolute_path", "Never exported"],
  ["file_handle", "Never exported"],
  ["os_username", "Never exported"],
  ["raw_external_content", "Never exported"],
] as const;

export function canonicalExportJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function buildManifestBody(
  snapshot: CloudExportSnapshotV1 | null,
  _scope: ExportScope,
  localEntries: readonly ExportManifestEntry[],
  accountScopeDigest = snapshot?.accountScopeDigest,
  snapshotEntriesLocalOnly = false,
): ExportManifestBody {
  const cloudEntries = snapshot?.entries.map((entry) => ({
    path: entry.path,
    kind: entry.kind,
    bytes: entry.bytes,
    sha256: entry.sha256,
    protected: true as const,
    localOnly: snapshotEntriesLocalOnly,
  })) ?? [];
  const entries = [...cloudEntries, ...localEntries].sort(compareEntry);
  const counts = { ...(snapshot?.counts ?? {}) };
  for (const entry of localEntries) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  if (!accountScopeDigest) throw new Error("导出缺少账号范围摘要");
  return {
    accountScopeDigest,
    entries,
    relationshipCount: snapshot?.relationshipCount ?? 0,
    relationshipSha256: snapshot?.relationshipSha256 ?? hashJson([]),
    counts: sortRecord(counts),
    excluded: MANDATORY_EXPORT_EXCLUSIONS.map(([kind, reason]) => ({ kind, reason })),
  };
}

export function manifestRootSha256(body: ExportManifestBody): string {
  return hashJson(body);
}

export function buildExportAad(
  format: ExportEnvelopeV1Shape,
  exportId: string,
  scope: ExportScope,
  snapshot: ExportSnapshotView,
  manifestBody: ExportManifestBody,
  rootSha256: string,
): string {
  return canonicalExportJson({
    format,
    schemaVersion: 1,
    exportId,
    scope,
    snapshot,
    manifestBody,
    rootSha256,
  });
}

export type ExportEnvelopeV1Shape = "coolto-data-export";

export function canonicalApiOrigin(apiBaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(apiBaseUrl);
  } catch {
    throw new Error("导出 API 来源无效");
  }
  if (parsed.protocol === "local:") {
    if (parsed.host !== "desktop") throw new Error("导出 API 来源无效");
    return "local://desktop";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("导出 API 来源无效");
  }
  return parsed.origin;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(canonicalExportJson(value), "utf8").digest("hex");
}

function compareEntry(left: ExportManifestEntry, right: ExportManifestEntry): number {
  return compareString(left.path, right.path) || compareString(left.kind, right.kind);
}

function sortRecord(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareString(left, right)));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => compareString(left, right))
    .map(([key, item]) => [key, sortValue(item)]));
}

function compareString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
