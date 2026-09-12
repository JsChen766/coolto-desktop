import { EncryptedMaterialRepository, type MaterialStoredRecord } from "../../src/material/material-repository.js";

const [root, encodedKey] = process.argv.slice(2);
if (!root || !encodedKey) throw new Error("crash child requires repository root and key");

const record: MaterialStoredRecord = {
  asset: {
    schema: "material.asset", version: 1,
    identity: { materialId: "mat_transaction", ownerId: "owner-a", contentHash: "e".repeat(64), contentVersion: 1 },
    metadata: { title: "Crash transaction", mediaKind: "text", sourceKind: "user_upload", sourceLabel: null, originalFilename: "transaction.txt", capturedAt: "2026-01-02T03:04:05.000Z" },
    processing: { status: "completed", ocr: null },
  },
  lifecycleStatus: "ready", classification: "classified", bytes: Buffer.alloc(24 * 1024 * 1024, 0x45),
  parsedText: "new generation only", parsedChunks: [], ocrText: null, ocrSegments: [], relations: [], lastError: null,
};

await new EncryptedMaterialRepository(root, "owner-a", Buffer.from(encodedKey, "base64")).save(record);
