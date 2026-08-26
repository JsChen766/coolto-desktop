import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app, safeStorage } from "electron";

import { uuidV7 } from "../../../agent-task/uuid-v7.js";
import type { AgentEvidenceStore, AgentEvidenceV1 } from "../../../agent-task/evidence-types.js";
import { renameAgentFile } from "./atomic-agent-file.js";

export class ElectronAgentEvidenceStore implements AgentEvidenceStore {
  readonly #directory: string;

  public constructor(private readonly ownerId: string) {
    const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 20);
    this.#directory = join(app.getPath("userData"), "agent-evidence", ownerHash);
  }

  public async save(
    input: Omit<AgentEvidenceV1, "version" | "id" | "ownerId">,
  ): Promise<AgentEvidenceV1> {
    ensureEncryption();
    const evidence: AgentEvidenceV1 = {
      version: 1, id: uuidV7(), ownerId: this.ownerId, ...structuredClone(input),
    };
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const destination = this.#path(evidence.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(
      temporary,
      safeStorage.encryptString(JSON.stringify(evidence)),
      { mode: 0o600 },
    );
    await renameAgentFile(temporary, destination);
    return evidence;
  }

  public async read(evidenceId: string): Promise<AgentEvidenceV1 | undefined> {
    assertId(evidenceId);
    try {
      ensureEncryption();
      const parsed = JSON.parse(
        safeStorage.decryptString(await readFile(this.#path(evidenceId))),
      ) as unknown;
      if (!isEvidence(parsed) || parsed.ownerId !== this.ownerId) return undefined;
      if (Date.parse(parsed.expiresAt) <= Date.now()) {
        await unlink(this.#path(evidenceId)).catch(() => undefined);
        return undefined;
      }
      return structuredClone(parsed);
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  public async clearExpired(now = Date.now()): Promise<number> {
    ensureEncryption();
    let cleared = 0;
    for (const filename of await readdir(this.#directory).catch(() => [])) {
      if (!filename.endsWith(".coolto")) continue;
      const path = join(this.#directory, filename);
      let expired = true;
      try {
        const parsed = JSON.parse(
          safeStorage.decryptString(await readFile(path)),
        ) as unknown;
        expired = !isEvidence(parsed) || parsed.ownerId !== this.ownerId ||
          Date.parse(parsed.expiresAt) <= now;
      } catch { expired = true; }
      if (expired) {
        await unlink(path).catch(() => undefined);
        cleared += 1;
      }
    }
    return cleared;
  }

  public clearAll(): Promise<void> {
    return rm(this.#directory, { recursive: true, force: true });
  }

  #path(id: string): string {
    return join(this.#directory, `${id}.coolto`);
  }
}

function ensureEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝保存 Agent evidence");
  }
}

function assertId(value: string): void {
  if (!/^[0-9a-f-]{36}$/u.test(value)) throw new Error("Evidence ID 无效");
}

function isEvidence(value: unknown): value is AgentEvidenceV1 {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AgentEvidenceV1>;
  return record.version === 1 && typeof record.id === "string" &&
    typeof record.ownerId === "string" && typeof record.expiresAt === "string";
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error &&
    (error as { code?: string }).code === "ENOENT");
}
