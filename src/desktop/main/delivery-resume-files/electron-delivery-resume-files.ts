import { join } from "node:path";

import { app, safeStorage } from "electron";

import { scopedDirectories, localScopeDigest } from "../../../privacy/local-scope.js";
import { DeliveryResumeFileRepository } from "../../../delivery-resume-files/file-repository.js";
import type { DeliveryResumeFileCodec } from "../../../delivery-resume-files/types.js";

export function createElectronDeliveryResumeFiles(
  apiBaseUrl: string,
  ownerId: string,
): DeliveryResumeFileRepository {
  const paths = scopedDirectories(app.getPath("userData"), "delivery-resume-files", apiBaseUrl, ownerId);
  return new DeliveryResumeFileRepository(ownerId, paths.directory, electronCodec(apiBaseUrl, ownerId));
}

function electronCodec(apiBaseUrl: string, ownerId: string): DeliveryResumeFileCodec {
  const scopeDigest = localScopeDigest(apiBaseUrl, ownerId);
  const wrap = (kind: "text" | "bytes", value: string) =>
    JSON.stringify({ scopeDigest, ownerId, kind, value });
  const unwrap = (kind: "text" | "bytes", value: string): string => {
    const parsed = JSON.parse(value) as Partial<{ scopeDigest: string; ownerId: string; kind: string; value: string }>;
    if (parsed.scopeDigest !== scopeDigest || parsed.ownerId !== ownerId || parsed.kind !== kind ||
        typeof parsed.value !== "string") throw new Error("本地投递文件来源与当前 API 账号不匹配");
    return parsed.value;
  };
  return {
    encodeText(value) { requireEncryption(); return safeStorage.encryptString(wrap("text", value)); },
    decodeText(value) { requireEncryption(); return unwrap("text", safeStorage.decryptString(Buffer.from(value))); },
    encodeBytes(value) {
      requireEncryption();
      return safeStorage.encryptString(wrap("bytes", Buffer.from(value).toString("base64")));
    },
    decodeBytes(value) {
      requireEncryption();
      return Buffer.from(unwrap("bytes", safeStorage.decryptString(Buffer.from(value))), "base64");
    },
  };
}

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝明文保存用户原始简历");
  }
}
