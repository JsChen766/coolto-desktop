import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ENCRYPTION_VERSION = 1;

export async function writeMaterialEncrypted(
  file: string,
  value: unknown,
  key: Buffer,
  associatedData: string,
): Promise<void> {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const source = value instanceof Uint8Array
    ? Buffer.from(value)
    : Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(source), cipher.final()]);
  const payload = JSON.stringify({
    version: ENCRYPTION_VERSION,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temp, payload, { mode: 0o600 });
    const handle = await open(temp, "r+");
    try { await handle.sync(); } finally { await handle.close(); }
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function readMaterialEncrypted(
  file: string,
  key: Buffer,
  associatedData: string,
  binary = false,
): Promise<unknown> {
  const payload = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  if (payload.version !== ENCRYPTION_VERSION
    || typeof payload.nonce !== "string"
    || typeof payload.tag !== "string"
    || typeof payload.ciphertext !== "string") {
    throw new Error("Material encrypted record is malformed");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.nonce, "base64"));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return binary ? new Uint8Array(plaintext) : JSON.parse(plaintext.toString("utf8"));
}
