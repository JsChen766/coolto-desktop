import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";

export const EXPORT_MAX_BYTES = 64 * 1024 * 1024;
export const EXPORT_SCRYPT = {
  N: 32_768,
  r: 8,
  p: 1,
  keyLength: 32,
  maxMemoryBytes: 64 * 1024 * 1024,
} as const;

export interface EncryptedExportPayload {
  salt: string;
  nonce: string;
  tag: string;
  aadSha256: string;
  payload: string;
}

export async function encryptExportPayload(
  plaintext: Uint8Array,
  passphrase: string,
  aad: string,
): Promise<EncryptedExportPayload> {
  validatePassphrase(passphrase);
  if (plaintext.byteLength > EXPORT_MAX_BYTES) throw new Error("导出内容超过 64 MiB 上限");
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const payload = ciphertext.toString("base64");
  if (Buffer.byteLength(payload, "utf8") > EXPORT_MAX_BYTES) throw new Error("导出密文超过 64 MiB 上限");
  return {
    salt: salt.toString("base64"), nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"),
    aadSha256: createHash("sha256").update(aad, "utf8").digest("hex"), payload,
  };
}

export async function decryptExportPayload(
  encrypted: EncryptedExportPayload,
  passphrase: string,
  aad: string,
): Promise<Buffer> {
  validatePassphrase(passphrase);
  const salt = decodeExact(encrypted.salt, 16, "salt");
  const nonce = decodeExact(encrypted.nonce, 12, "nonce");
  const tag = decodeExact(encrypted.tag, 16, "tag");
  const payload = Buffer.from(encrypted.payload, "base64");
  if (payload.byteLength > EXPORT_MAX_BYTES) throw new Error("导出密文超过 64 MiB 上限");
  const aadSha256 = createHash("sha256").update(aad, "utf8").digest("hex");
  if (encrypted.aadSha256 !== aadSha256) throw new Error("导出 AAD 校验失败");
  const key = await deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  const memoryCost = 128 * EXPORT_SCRYPT.r * EXPORT_SCRYPT.N;
  if (memoryCost > EXPORT_SCRYPT.maxMemoryBytes) throw new Error("scrypt 内存参数超过安全上限");
  const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
  scryptCallback(
    passphrase,
    salt,
    EXPORT_SCRYPT.keyLength,
    { N: EXPORT_SCRYPT.N, r: EXPORT_SCRYPT.r, p: EXPORT_SCRYPT.p, maxmem: EXPORT_SCRYPT.maxMemoryBytes },
    (error, derived) => { if (error) reject(error); else resolve(derived); },
  );
  return promise;
}

function validatePassphrase(value: string): void {
  if (typeof value !== "string" || value.length < 8 || value.length > 512) throw new Error("导出密码长度必须为 8–512 个字符");
}

function decodeExact(value: string, length: number, label: string): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== length) throw new Error(`导出 ${label} 长度无效`);
  return decoded;
}
