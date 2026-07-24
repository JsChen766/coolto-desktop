import { createHash } from "node:crypto";
import { join } from "node:path";

import { app, safeStorage } from "electron";

import type { ResumeDraftCodec } from "../../../resume/draft/types.js";
import { ResumeDraftFileRepository } from "./draft-file-repository.js";

export function createElectronResumeDraftRepository(
  ownerId: string,
): ResumeDraftFileRepository {
  const ownerHash = createHash("sha256")
    .update(ownerId)
    .digest("hex")
    .slice(0, 20);
  return new ResumeDraftFileRepository(
    ownerId,
    join(app.getPath("userData"), "resume-drafts", ownerHash),
    electronCodec,
  );
}

const electronCodec: ResumeDraftCodec = {
  encode(value) {
    requireEncryption();
    return safeStorage.encryptString(value);
  },
  decode(value) {
    requireEncryption();
    return safeStorage.decryptString(Buffer.from(value));
  },
};

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝明文保存本地简历");
  }
}
