import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS profile_target_identities (
    owner_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    target_id TEXT NOT NULL,
    PRIMARY KEY (owner_id, fingerprint),
    UNIQUE (owner_id, target_id)
  )
`;

export class ProfileTargetIdentityStore {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly ownerId: string,
  ) {
    this.database.exec(TABLE_SQL);
  }

  public resolve(fingerprint: string, preferredId?: string): string {
    const existing = this.database.prepare(`
      SELECT target_id FROM profile_target_identities
      WHERE owner_id = ? AND fingerprint = ?
    `).get(this.ownerId, fingerprint) as { target_id?: string } | undefined;
    if (existing?.target_id) return existing.target_id;
    const targetId = preferredId ?? randomUUID();
    this.database.prepare(`
      INSERT INTO profile_target_identities (owner_id, fingerprint, target_id)
      VALUES (?, ?, ?)
      ON CONFLICT (owner_id, fingerprint) DO NOTHING
    `).run(this.ownerId, fingerprint, targetId);
    const resolved = this.database.prepare(`
      SELECT target_id FROM profile_target_identities
      WHERE owner_id = ? AND fingerprint = ?
    `).get(this.ownerId, fingerprint) as { target_id?: string } | undefined;
    return resolved?.target_id ?? targetId;
  }

  public clear(): void {
    this.database.prepare(
      "DELETE FROM profile_target_identities WHERE owner_id = ?",
    ).run(this.ownerId);
  }
}
