import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { app, safeStorage } from "electron";
import {
  assertOwnedPrivacyPath,
  deletionPhaseRestrictsOrdinaryAccess,
  hashOwner,
  isValidDeletionRecoveryRecord,
  recoveryOwnerFromFilename,
  validateDeletionRecoveryDiscovery,
} from "./deletion-recovery-validation.js";
import { canonicalApiOrigin } from "../../../privacy/export-canonical.js";

export interface DeletionRecoveryRecord {
  version: 1;
  apiBaseUrl: string;
  ownerId: string;
  accountEmail: string;
  ownerHash: string;
  phase: "awaiting_saved" | "confirm_sent" | "confirmed";
  requestId: string | null;
  startIdempotencyKey: string;
  confirmationDigest: string;
  controlToken: string | null;
  ackIdempotencyKey: string;
  localWipeComplete: boolean;
}

export interface DeletionRecoveryStorePort {
  newRecord(confirmationDigest: string, accountEmail: string): DeletionRecoveryRecord;
  load(): Promise<DeletionRecoveryRecord | undefined>;
  save(record: DeletionRecoveryRecord): Promise<void>;
  clear(): Promise<void>;
}

export class DeletionRecoveryStore implements DeletionRecoveryStorePort {
  readonly #path: string;
  readonly #apiBaseUrl: string;
  readonly #ownerId: string;
  readonly #ownerHash: string;

  public constructor(apiBaseUrl: string, ownerId: string, path?: string, ownerHashOverride?: string) {
    this.#apiBaseUrl = canonicalApiOrigin(apiBaseUrl);
    this.#ownerId = ownerId;
    this.#ownerHash = ownerHashOverride ?? hashOwner(this.#apiBaseUrl, ownerId);
    this.#path = path ?? join(app.getPath("userData"), "privacy", `deletion-${this.#ownerHash}.coolto`);
  }

  public static async discover(apiBaseUrl: string, ownerId?: string): Promise<DeletionRecoveryStore[]> {
    const normalizedApiBaseUrl = canonicalApiOrigin(apiBaseUrl);
    const root = resolve(app.getPath("userData"), "privacy");
    const rootReal = await existingRealPath(root);
    if (!rootReal) return [];
    if (resolve(root) !== resolve(rootReal)) throw new Error("删除恢复隐私目录不是应用拥有的目录");
    requireEncryption();
    const entries = await readdir(rootReal, { withFileTypes: true });
    const stores: DeletionRecoveryStore[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error("删除恢复目录包含不受信任的链接");
      const ownerHash = recoveryOwnerFromFilename(entry.name);
      if (!ownerHash) continue;
      if (!entry.isFile()) throw new Error("删除恢复记录必须是普通文件");
      const path = resolve(rootReal, entry.name);
      assertOwnedPrivacyPath(rootReal, path);
      const resolvedPath = await realpath(path);
      assertOwnedPrivacyPath(rootReal, resolvedPath);
      if ((await stat(resolvedPath)).size > 1024 * 1024) throw new Error("删除恢复密文过大");
      const parsed = JSON.parse(safeStorage.decryptString(await readFile(resolvedPath))) as unknown;
      const recordOrigin = recoveryRecordOrigin(parsed);
      if (!validateDeletionRecoveryDiscovery(
        parsed,
        recordOrigin,
        normalizedApiBaseUrl,
        ownerHash,
      )) continue;
      if (ownerId && parsed.ownerId !== ownerId) continue;
      stores.push(new DeletionRecoveryStore(normalizedApiBaseUrl, parsed.ownerId, resolvedPath, ownerHash));
    }
    return stores;
  }

  public static async discoverOne(
    apiBaseUrl: string,
    ownerId?: string,
  ): Promise<DeletionRecoveryStore | undefined> {
    const stores = await DeletionRecoveryStore.discover(apiBaseUrl, ownerId);
    if (stores.length > 1) throw new Error("检测到多个删除恢复记录，拒绝选择");
    return stores[0];
  }

  public static async hasAny(apiBaseUrl: string): Promise<boolean> {
    return (await DeletionRecoveryStore.discoverOne(apiBaseUrl)) !== undefined;
  }
  public static async hasRestricted(
    apiBaseUrl: string,
    ownerId?: string,
  ): Promise<boolean> {
    const store = await DeletionRecoveryStore.discoverOne(apiBaseUrl, ownerId);
    if (!store) return false;
    const record = await store.load();
    return record ? deletionPhaseRestrictsOrdinaryAccess(record.phase) : false;
  }

  public matchesOwner(ownerId: string): boolean {
    return this.#ownerHash === hashOwner(this.#apiBaseUrl, ownerId);
  }

  public newRecord(
    confirmationDigest: string,
    accountEmail: string,
  ): DeletionRecoveryRecord {
    return {
      version: 1,
      apiBaseUrl: this.#apiBaseUrl,
      ownerId: this.#ownerId,
      accountEmail,
      ownerHash: this.#ownerHash,
      phase: "awaiting_saved",
      requestId: null,
      startIdempotencyKey: randomBytes(32).toString("base64url"),
      confirmationDigest,
      controlToken: null,
      ackIdempotencyKey: randomBytes(32).toString("base64url"),
      localWipeComplete: false,
    };
  }

  public async load(): Promise<DeletionRecoveryRecord | undefined> {
    try {
      requireEncryption();
      const root = resolve(app.getPath("userData"), "privacy");
      assertOwnedPrivacyPath(root, this.#path);
      const resolvedPath = await realpath(this.#path);
      assertOwnedPrivacyPath(root, resolvedPath);
      const parsed = JSON.parse(safeStorage.decryptString(await readFile(resolvedPath))) as unknown;
      if (!isValidDeletionRecoveryRecord(parsed, this.#apiBaseUrl, this.#ownerHash)) throw new Error("本地删除恢复记录格式无效");
      return parsed;
    } catch (error: unknown) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  public async save(record: DeletionRecoveryRecord): Promise<void> {
    if (!isValidDeletionRecoveryRecord(record, this.#apiBaseUrl, this.#ownerHash)) throw new Error("拒绝保存无效删除恢复记录");
    requireEncryption();
    const root = resolve(app.getPath("userData"), "privacy");
    const destination = resolve(this.#path);
    assertOwnedPrivacyPath(root, destination);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const rootReal = await realpath(root);
    if (resolve(root) !== resolve(rootReal)) throw new Error("删除恢复隐私目录不是应用拥有的目录");
    const parentReal = await realpath(dirname(destination));
    if (resolve(parentReal) !== resolve(rootReal)) throw new Error("删除恢复记录目录不是应用拥有的目录");
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "w", 0o600);
    let failure: unknown;
    try {
      await handle.writeFile(safeStorage.encryptString(JSON.stringify(record)));
      await handle.sync();
    } catch (error: unknown) {
      failure = error;
    }
    try {
      await handle.close();
    } catch (error: unknown) {
      failure ??= error;
    }
    if (failure) {
      await unlink(temporary).catch(() => undefined);
      throw failure;
    }
    try {
      await rename(temporary, destination);
    } catch (error: unknown) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  public async clear(): Promise<void> {
    await unlink(this.#path).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }
}

async function existingRealPath(path: string): Promise<string | undefined> {
  try { return await realpath(path); } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储不可用，拒绝保存删除恢复状态");
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return Reflect.get(error, "code") === "ENOENT";
}
function recoveryRecordOrigin(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("删除恢复记录格式无效");
  }
  const apiBaseUrl = Reflect.get(value, "apiBaseUrl");
  if (typeof apiBaseUrl !== "string") throw new Error("删除恢复记录来源无效");
  return canonicalApiOrigin(apiBaseUrl);
}
