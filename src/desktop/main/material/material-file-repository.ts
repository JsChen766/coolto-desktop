import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app, safeStorage } from "electron";

import { syncScopeKey } from "../../../privacy/local-scope.js";
import {
  EncryptedMaterialRepository,
  type MaterialRepository,
} from "../../../material/material-repository.js";

export class MaterialFileRepository extends EncryptedMaterialRepository {
  public constructor(root: string, ownerId: string, key: Uint8Array, scopeKey = "default") {
    super(root, ownerId, key, scopeKey);
  }

  public static async openForOwner(ownerId: string, apiBaseUrl = "https://local.invalid"): Promise<MaterialFileRepository> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储不可用，无法打开材料仓库");
    }
    const scope = syncScopeKey(apiBaseUrl, ownerId);
    const root = join(app.getPath("userData"), "materials", scope);
    const keyPath = join(root, "repository.key");
    await mkdir(root, { recursive: true, mode: 0o700 });
    let key: Buffer;
    try {
      const encoded = safeStorage.decryptString(await readFile(keyPath));
      key = Buffer.from(encoded, "base64");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      key = randomBytes(32);
      await writeFile(keyPath, safeStorage.encryptString(key.toString("base64")), { mode: 0o600 });
      await chmod(keyPath, 0o600);
    }
    return new MaterialFileRepository(root, ownerId, key, scope);
  }
}

export interface MaterialRepositoryFactory {
  open(ownerId: string, apiBaseUrl?: string): Promise<MaterialRepository>;
}

export function createMaterialRepositoryFactory(): MaterialRepositoryFactory {
  return { open: (ownerId, apiBaseUrl) => MaterialFileRepository.openForOwner(ownerId, apiBaseUrl) };
}
