import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const FORMAT_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SyncPayloadCodec {
  public constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error("同步存储密钥必须是 256 位");
    }
  }

  public encode(value: unknown): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([
      Buffer.from([FORMAT_VERSION]),
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]);
  }

  public decode<T>(value: Uint8Array): T {
    const encoded = Buffer.from(value);
    if (encoded.length <= 1 + IV_BYTES + TAG_BYTES || encoded[0] !== FORMAT_VERSION) {
      throw new Error("同步存储密文格式无效");
    }
    const iv = encoded.subarray(1, 1 + IV_BYTES);
    const tag = encoded.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const ciphertext = encoded.subarray(1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  }
}
