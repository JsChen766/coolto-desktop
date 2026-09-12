import { createHash, randomUUID } from "node:crypto";

import { canonicalMaterialJson, type MaterialCanonicalValue } from "./material-identity.js";
import type { MaterialRepository, MaterialStoredRecord } from "./material-repository.js";

export interface MaterialDeleteImpact {
  materialId: string;
  confirmationToken: string;
  affectedExperiences: Array<{ experienceId: string; citationCount: number }>;
  publishedAssetsPreserved: boolean;
}

export class MaterialDeleteImpactService {
  readonly #pending = new Map<string, { materialId: string; contentHash: string; impactDigest: string }>();

  public constructor(private readonly repository: MaterialRepository) {}

  public async preview(materialId: string): Promise<MaterialDeleteImpact> {
    const record = await this.repository.get(materialId);
    if (!record) throw new Error(`Material ${materialId} 不存在`);
    const confirmationToken = `mat-delete-${randomUUID()}`;
    this.#pending.set(confirmationToken, {
      materialId: record.asset.identity.materialId,
      contentHash: record.asset.identity.contentHash,
      impactDigest: materialDeleteImpactDigest(record),
    });
    return {
      materialId: record.asset.identity.materialId,
      confirmationToken,
      affectedExperiences: record.relations
        .map((relation) => ({
          experienceId: relation.experienceId,
          citationCount: relation.citations.length,
        }))
        .sort((left, right) => left.experienceId.localeCompare(right.experienceId)),
      publishedAssetsPreserved: true,
    };
  }

  public cancel(confirmationToken: string): void {
    this.#pending.delete(confirmationToken);
  }

  public async confirm(confirmationToken: string): Promise<void> {
    const pending = this.#pending.get(confirmationToken);
    if (!pending) throw new Error("材料删除确认已取消或已使用");
    this.#pending.delete(confirmationToken);
    await this.repository.compareAndRemove(
      pending.materialId,
      pending.contentHash,
      (record) => materialDeleteImpactDigest(record) === pending.impactDigest,
    );
  }
}

export function materialDeleteImpactDigest(record: MaterialStoredRecord): string {
  const snapshot = {
    identity: record.asset.identity,
    lifecycleStatus: record.lifecycleStatus,
    classification: record.classification ?? "unclassified",
    relations: record.relations
      .map((relation) => ({
        relationId: relation.relationId,
        experienceId: relation.experienceId,
        citations: relation.citations,
        createdAt: relation.createdAt,
      }))
      .sort((left, right) => left.relationId.localeCompare(right.relationId)),
  };
  return createHash("sha256")
    .update(canonicalMaterialJson(snapshot as unknown as MaterialCanonicalValue), "utf8")
    .digest("hex");
}
