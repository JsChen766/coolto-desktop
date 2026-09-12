import { createHash, randomUUID } from "node:crypto";

import type { CloudExportSnapshotV1 } from "./types.js";
import {
  MANDATORY_EXPORT_EXCLUSIONS,
  buildExportAad,
  buildManifestBody,
  canonicalExportJson,
  manifestRootSha256,
} from "./export-canonical.js";
import { encryptExportPayload } from "./export-crypto.js";
import type {
  ExportEnvelopeV1,
  ExportLocalPayload,
  ExportManifestEntry,
  ExportPayloadV1,
  ExportScope,
  ExportSnapshotView,
} from "./export-types.js";

export interface ExportPackageInput {
  snapshot: CloudExportSnapshotV1 | null;
  accountScopeDigest?: string;
  local: ExportLocalPayload;
  includeConversations: boolean;
  includeDrafts: boolean;
  includeTasks: boolean;
  passphrase: string;
  mode: ExportSnapshotView["mode"];
  exportId?: string;
  createdAt?: string;
}

export async function buildExportPackage(input: ExportPackageInput): Promise<ExportEnvelopeV1> {
  const scope: ExportScope = {
    cloudAssets: input.snapshot !== null,
    localConversations: input.includeConversations,
    localDrafts: input.includeDrafts,
    localTasks: input.includeTasks,
    rawFiles: false,
  };
  const local = selectLocal(input.local, input);
  assertSafeExportValue(input.snapshot?.entries ?? [], "cloud.entries");
  assertSafeExportValue(local, "local");
  const snapshot: ExportSnapshotView = {
    mode: input.mode,
    capturedAt: input.snapshot?.capturedAt ?? input.createdAt ?? new Date().toISOString(),
    syncIssues: input.mode === "synchronized" ? 0 : 1,
  };
  const accountScopeDigest = input.accountScopeDigest ?? input.snapshot?.accountScopeDigest;
  if (!accountScopeDigest) throw new Error("导出缺少账号范围摘要");
  const manifestBody = buildManifestBody(
    input.snapshot,
    scope,
    localEntriesFor(local),
    accountScopeDigest,
  );
  const rootSha256 = manifestRootSha256(manifestBody);
  const exportId = input.exportId ?? randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const aad = buildExportAad("coolto-data-export", exportId, scope, snapshot, manifestBody, rootSha256);
  const payload: ExportPayloadV1 = {
    cloud: input.snapshot
      ? { entries: input.snapshot.entries, relationships: input.snapshot.relationships }
      : null,
    local,
  };
  const encrypted = await encryptExportPayload(
    Buffer.from(canonicalExportJson(payload), "utf8"), input.passphrase, aad,
  );
  const { payload: ciphertext, salt, nonce, tag, aadSha256 } = encrypted;
  const envelope: ExportEnvelopeV1 = {
    format: "coolto-data-export",
    schemaVersion: 1,
    exportId,
    createdAt,
    scope,
    snapshot,
    manifest: { body: manifestBody, rootSha256 },
    encryption: {
      kdf: "scrypt",
      kdfParams: { N: 32768, r: 8, p: 1, keyLength: 32, maxMemoryBytes: 67108864 },
      cipher: "aes-256-gcm",
      salt,
      nonce,
      tag,
      aadSha256,
    },
    payload: ciphertext,
  };
  if (Buffer.byteLength(canonicalExportJson(envelope), "utf8") > 64 * 1024 * 1024) {
    throw new Error("导出包超过 64 MiB 上限");
  }
  return envelope;
}

function selectLocal(local: ExportLocalPayload, input: ExportPackageInput): ExportPayloadV1["local"] {
  return {
    ...(input.includeConversations && local.conversations ? { conversations: local.conversations } : {}),
    ...(input.includeDrafts && local.drafts ? { drafts: local.drafts } : {}),
    ...(input.includeTasks && local.tasks ? { tasks: local.tasks } : {}),
  };
}

function localEntriesFor(local: ExportPayloadV1["local"]): ExportManifestEntry[] {
  return Object.entries(local).flatMap(([kind, values]) => {
    if (!values) return [];
    const serialized = canonicalExportJson(values);
    return [{
      path: `local/${kind}.json`,
      kind: `local_${kind}`,
      bytes: Buffer.byteLength(serialized, "utf8"),
      sha256: createHash("sha256").update(serialized, "utf8").digest("hex"),
      protected: true,
      localOnly: true,
    }];
  });
}

function assertSafeExportValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeExportValue(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) throw new Error(`导出包含禁止字段：${path}.${key}`);
    assertSafeExportValue(item, `${path}.${key}`);
  }
}

const FORBIDDEN_KEYS = new Set([
  "accesstoken", "access_token", "sessiontoken", "session_token", "refreshtoken", "refresh_token",
  "password", "passwordhash", "otp", "apikey", "api_key", "encryptionkey", "encryption_key", "passphrase",
  "cookie", "cookies", "localstorage", "dom", "downloads", "filehandle", "file_handle", "absolutepath",
  "absolute_path", "agentgrant", "agent_grant", "actiontoken", "action_token", "browsertoken", "browser_token",
  "privatekey", "private_key", "ownerid", "owner_id", "userid", "user_id",
  ...MANDATORY_EXPORT_EXCLUSIONS.flatMap(([key]) => [key, key.replaceAll("_", "")]),
]);
