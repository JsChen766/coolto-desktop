import { createHash } from "node:crypto";
import { join } from "node:path";

import { app, safeStorage } from "electron";

import { DeliveryResumeFileRepository } from
  "../../../delivery-resume-files/file-repository.js";
import type { DeliveryResumeFileCodec } from
  "../../../delivery-resume-files/types.js";

export function createElectronDeliveryResumeFiles(
  ownerId: string,
): DeliveryResumeFileRepository {
  const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 20);
  return new DeliveryResumeFileRepository(
    ownerId,
    join(app.getPath("userData"), "delivery-resume-files", ownerHash),
    electronCodec,
  );
}

const electronCodec: DeliveryResumeFileCodec = {
  encodeText(value) {
    requireEncryption();
    return safeStorage.encryptString(value);
  },
  decodeText(value) {
    requireEncryption();
    return safeStorage.decryptString(Buffer.from(value));
  },
  encodeBytes(value) {
    requireEncryption();
    return safeStorage.encryptString(Buffer.from(value).toString("base64"));
  },
  decodeBytes(value) {
    requireEncryption();
    return Buffer.from(safeStorage.decryptString(Buffer.from(value)), "base64");
  },
};

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝明文保存用户原始简历");
  }
}
