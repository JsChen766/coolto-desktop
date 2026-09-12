import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { canonicalApiOrigin } from "../../../privacy/export-canonical.js";
import type { DeletionRecoveryRecord } from "./deletion-recovery-store.js";
export function hashOwner(apiBaseUrl: string, ownerId: string): string {
  return createHash("sha256").update(canonicalApiOrigin(apiBaseUrl)).update("\0").update(ownerId).digest("hex").slice(0, 24);
}

export function recoveryOwnerFromFilename(name: string): string | undefined {
  return /^deletion-([0-9a-f]{24})\.coolto$/u.exec(name)?.[1];
}
export function deletionPhaseRestrictsOrdinaryAccess(
  phase: DeletionRecoveryRecord["phase"],
): boolean {
  return phase === "confirm_sent" || phase === "confirmed";
}


export function assertOwnedPrivacyPath(root: string, target: string): void {
  const child = relative(resolve(root), resolve(target));
  if (!child || isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`)) {
    throw new Error("删除恢复路径不在应用隐私目录内");
  }
}

export function isValidDeletionRecoveryRecord(
  value: unknown,
  apiBaseUrl: string,
  ownerHash: string,
): value is DeletionRecoveryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return false;
  const record = value as Partial<DeletionRecoveryRecord>;
  const requiresControl =
    record.phase === "confirm_sent" || record.phase === "confirmed";
  const accountEmail =
    typeof record.accountEmail === "string" ? record.accountEmail : "";
  const validToken = record.controlToken === null ||
    (typeof record.controlToken === "string" && record.controlToken.length >= 32);
  const validRequestId = record.requestId === null ||
    (typeof record.requestId === "string" &&
      record.requestId.length > 0 && record.requestId.length <= 200);
  const hasRequestAndToken =
    (record.requestId === null) === (record.controlToken === null);
  return record.version === 1 &&
    typeof record.ownerId === "string" && record.ownerId.length > 0 &&
    accountEmail.length > 0 && accountEmail.length <= 320 &&
    accountEmail === accountEmail.trim().toLowerCase() &&
    record.apiBaseUrl === apiBaseUrl.replace(/\/+$/, "") &&
    record.ownerHash === ownerHash &&
    hashOwner(record.apiBaseUrl, record.ownerId) === ownerHash &&
    ["awaiting_saved", "confirm_sent", "confirmed"].includes(record.phase ?? "") &&
    validRequestId &&
    validToken &&
    hasRequestAndToken &&
    (!requiresControl ||
      (record.requestId !== null && record.controlToken !== null)) &&
    typeof record.startIdempotencyKey === "string" &&
    record.startIdempotencyKey.length >= 32 &&
    /^[0-9a-f]{64}$/u.test(record.confirmationDigest ?? "") &&
    typeof record.ackIdempotencyKey === "string" &&
    record.ackIdempotencyKey.length >= 32 &&
    typeof record.localWipeComplete === "boolean";
}
export function validateDeletionRecoveryDiscovery(
  value: unknown,
  recordOrigin: string,
  currentApiBaseUrl: string,
  ownerHash: string,
): value is DeletionRecoveryRecord {
  if (!isValidDeletionRecoveryRecord(value, recordOrigin, ownerHash)) {
    throw new Error("删除恢复记录校验失败");
  }
  return recordOrigin === canonicalApiOrigin(currentApiBaseUrl);
}

export function normalizeRecoveryEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320) {
    throw new Error("删除恢复账号邮箱无效");
  }
  return normalized;
}
