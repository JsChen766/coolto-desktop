import { join } from "node:path";

import { app, safeStorage } from "electron";

import type { ResumeDraftCodec } from "../../../resume/draft/types.js";
import {
  localScopeDigest,
  scopedDirectories,
} from "../../../privacy/local-scope.js";
import { ResumeDraftFileRepository } from "./draft-file-repository.js";

export function createElectronResumeDraftRepository(
  apiBaseUrl: string,
  ownerId: string,
): ResumeDraftFileRepository {
  const paths = scopedDirectories(app.getPath("userData"), "resume-drafts", apiBaseUrl, ownerId);
  return new ResumeDraftFileRepository(
    ownerId,
    paths.directory,
    electronCodec,
    localScopeDigest(apiBaseUrl, ownerId),
    paths.legacyDirectory,
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
