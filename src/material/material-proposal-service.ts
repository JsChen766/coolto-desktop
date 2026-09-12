import { randomUUID } from "node:crypto";

import { canonicalMaterialJson, type MaterialCanonicalValue } from "./material-identity.js";
import { planMaterialRelationProposal, type MaterialRelationPlanInputV1, type MaterialRelationProposalV1 } from "./material-relations.js";
import type { MaterialApprovalJournalEntry, MaterialPreparedCommit } from "./material-proposal-journal.js";
import type { MaterialClassification, MaterialOcrBinding, MaterialRepository, MaterialRelationRecord, MaterialStoredRecord } from "./material-repository.js";
import { isSafeOpaqueId, type MaterialIntakeAuthorizationV1 } from "./material-types.js";
import type { OCRConfidenceV1 } from "./material-ocr-confidence.js";

export type MaterialProposalStatus = "pending" | "executing" | "needs_user_decision" | "approved" | "rejected";
export interface MaterialRelationCommitInput {
  proposal: MaterialRelationProposalV1;
  experienceId: string;
  citations: readonly unknown[];
  idempotencyKey: string;
}
export interface MaterialRelationCommitPort {
  /** Must deduplicate retries by idempotencyKey, including a restart before prepare resolves. */
  prepare(input: MaterialRelationCommitInput): Promise<{ proposalId: string; experienceId?: string }>;
  /** The host must execute the complete prepared batch atomically or reject it. */
  executeMany(proposalIds: readonly string[]): Promise<readonly unknown[]>;
  reconcileMany?(input: { proposal: MaterialRelationProposalV1; prepared: readonly MaterialPreparedCommit[] }): Promise<"executed" | "not_executed" | "unknown">;
  discard?(proposalId: string): void;
}
export interface MaterialRelationProposalRecord { proposal: MaterialRelationProposalV1; status: MaterialProposalStatus; }
interface LiveProposal extends MaterialRelationProposalRecord { execution?: Promise<MaterialRelationProposalRecord>; }
interface MaterialChange { relationIds: string[]; previousClassification: MaterialClassification | undefined; }

export class MaterialProposalService {
  readonly #pending = new Map<string, LiveProposal>();
  readonly #recoveries = new Map<string, Promise<MaterialRelationProposalRecord>>();
  readonly #journal;

  public constructor(private readonly repository: MaterialRepository, private readonly commits?: MaterialRelationCommitPort) {
    this.#journal = repository.proposalJournal();
  }

  public async prepare(materialId: string, input: Omit<MaterialRelationPlanInputV1, "proposalId" | "preparedAt" | "material">, authorization?: MaterialIntakeAuthorizationV1): Promise<MaterialRelationProposalRecord> {
    const record = await this.repository.get(materialId);
    if (!record) throw new Error(`Material ${materialId} 不存在`);
    assertProposalMaterialTrust(record);
    const proposal = planMaterialRelationProposal({ ...input, proposalId: `mat-proposal-${randomUUID()}`, preparedAt: new Date().toISOString(), material: record.asset }, authorization);
    assertReferencesNotLinked(record, proposal, []);
    await this.#journal.create(proposal);
    const result: LiveProposal = { proposal, status: "pending" };
    this.#pending.set(proposal.proposalId, result);
    return cloneProposal(result);
  }

  public get(proposalId: string): MaterialRelationProposalRecord | undefined {
    const result = this.#pending.get(proposalId);
    return result ? cloneProposal(result) : undefined;
  }

  public async approve(proposalId: string): Promise<MaterialRelationProposalRecord> {
    const stored = this.#pending.get(proposalId);
    if (!stored) throw new Error("材料关系提案不存在或已经处理");
    if (stored.status === "executing") return stored.execution ?? Promise.reject(new Error("材料关系提案正在恢复"));
    if (stored.status !== "pending") throw new Error("材料关系提案不存在或已经处理");
    stored.status = "executing";
    const execution = this.#approveClaimed(stored);
    stored.execution = execution;
    return execution;
  }

  public recover(proposalId: string): Promise<MaterialRelationProposalRecord> {
    const pending = this.#recoveries.get(proposalId);
    if (pending) return pending;
    const recovery = this.#recover(proposalId).finally(() => { this.#recoveries.delete(proposalId); });
    this.#recoveries.set(proposalId, recovery);
    return recovery;
  }

  async #recover(proposalId: string): Promise<MaterialRelationProposalRecord> {
    const entry = await this.#journal.get(proposalId);
    if (!entry) throw new Error("材料关系提案不存在或已经处理");
    const stored: LiveProposal = { proposal: entry.proposal, status: entry.status };
    this.#pending.set(proposalId, stored);
    if (entry.status === "pending" || entry.status === "approved" || entry.status === "rejected" || entry.status === "needs_user_decision") return cloneProposal(stored);
    if (entry.phase === "claimed") return this.#resetPending(stored, entry.prepared);
    if (!preparedPrefixIsValid(stored.proposal, entry.prepared, Boolean(this.commits))) return this.#needsDecision(stored, "审批恢复记录无效，不能自动外部写入");
    if (entry.phase === "prepared") return this.#resetPending(stored, entry.prepared);
    if (!preparedBatchIsComplete(stored.proposal, entry.prepared, Boolean(this.commits))) return this.#needsDecision(stored, "审批恢复记录不完整，不能自动外部写入");
    if (entry.phase === "material_saving" && !await this.#containsRelations(stored.proposal, entry.prepared)) return this.#resetPending(stored, entry.prepared);
    if (entry.phase === "material_saving") await this.#journal.setMaterialSaved(proposalId);
    return this.#reconcile(stored, entry);
  }

  public reject(proposalId: string): void {
    const stored = this.#markRejected(proposalId);
    void this.#journal.reject(proposalId).catch(() => { stored.status = "needs_user_decision"; });
  }
  public async rejectAndWait(proposalId: string): Promise<void> {
    const stored = this.#markRejected(proposalId);
    await this.#journal.reject(proposalId).catch(() => { stored.status = "needs_user_decision"; });
  }
  public clear(): void { this.#pending.clear(); this.#recoveries.clear(); }

  async #approveClaimed(stored: LiveProposal): Promise<MaterialRelationProposalRecord> {
    const claim = await this.#journal.claim(stored.proposal.proposalId);
    if (!claim.claimed) return this.#fromExistingClaim(stored, claim.entry);
    const prepared: MaterialPreparedCommit[] = [];
    let change: MaterialChange | undefined;
    let externalExecutionStarted = false;
    try {
      assertProposalMaterialCurrent(stored.proposal, await this.repository.get(stored.proposal.materialId));
      if (this.commits) for (const [index, reference] of stored.proposal.experienceReferences.entries()) {
        const result = await this.commits.prepare({ proposal: stored.proposal, experienceId: reference.experienceId, citations: reference.citations, idempotencyKey: `${stored.proposal.proposalId}:${index}` });
        const item = { proposalId: result.proposalId, experienceId: result.experienceId ?? reference.experienceId, idempotencyKey: `${stored.proposal.proposalId}:${index}` };
        if (!preparedPrefixIsValid(stored.proposal, [...prepared, item], true)) throw new Error("宿主准备回执无效");
        prepared.push(item);
        await this.#journal.setPrepared(stored.proposal.proposalId, prepared);
      }
      await this.#journal.setPrepared(stored.proposal.proposalId, prepared);
      await this.#journal.setMaterialSaving(stored.proposal.proposalId);
      change = await this.#saveRelations(stored.proposal, prepared);
      await this.#journal.setMaterialSaved(stored.proposal.proposalId);
      if (this.commits) {
        await this.#journal.setExecuting(stored.proposal.proposalId);
        externalExecutionStarted = true;
        await this.commits.executeMany(prepared.map((item) => item.proposalId));
      }
      await this.#journal.approve(stored.proposal.proposalId);
      stored.status = "approved";
      return cloneProposal(stored);
    } catch (error) {
      if (externalExecutionStarted) return this.#needsDecision(stored, "外部经历批次结果不确定；请恢复后按收据处理", error);
      if (change) await this.#rollbackRelations(stored.proposal, change);
      return this.#resetPending(stored, prepared, error);
    }
  }

  async #reconcile(stored: LiveProposal, entry: MaterialApprovalJournalEntry): Promise<MaterialRelationProposalRecord> {
    if (!preparedBatchIsComplete(stored.proposal, entry.prepared, Boolean(this.commits))) return this.#needsDecision(stored, "审批收据不完整，不能自动外部写入");
    if (!await this.#containsRelations(stored.proposal, entry.prepared)) return this.#needsDecision(stored, "本地材料关系缺失，不能自动重复外部写入");
    if (!this.commits?.reconcileMany) return this.#needsDecision(stored, "宿主未提供幂等收据恢复；需要用户决定后续操作");
    let outcome: "executed" | "not_executed" | "unknown";
    try { outcome = await this.commits.reconcileMany({ proposal: stored.proposal, prepared: entry.prepared }); }
    catch { return this.#needsDecision(stored, "宿主收据无法确认；不能自动重复外部写入"); }
    if (outcome === "executed") {
      await this.#journal.approve(stored.proposal.proposalId, true);
      stored.status = "approved";
      return cloneProposal(stored);
    }
    if (outcome !== "not_executed") return this.#needsDecision(stored, "宿主收据结果不确定；需要用户决定");
    try {
      await this.#rollbackRecoveredRelations(stored.proposal, entry.prepared);
      return this.#resetPending(stored, entry.prepared);
    } catch (error) { return this.#needsDecision(stored, "宿主未执行但本地恢复不完整；需要用户决定", error); }
  }
  #markRejected(proposalId: string): LiveProposal {
    const stored = this.#pending.get(proposalId);
    if (!stored || stored.status !== "pending") throw new Error("材料关系提案不存在或已经处理");
    stored.status = "rejected";
    return stored;
  }

  async #saveRelations(proposal: MaterialRelationProposalV1, prepared: readonly MaterialPreparedCommit[]): Promise<MaterialChange> {
    const change: MaterialChange = { relationIds: [], previousClassification: undefined };
    await this.repository.compareAndSave(proposal.materialId, proposal.materialHash, (record) => {
      assertProposalMaterialCurrent(proposal, record); assertProposalMaterialTrust(record); assertReferencesNotLinked(record, proposal, prepared);
      change.previousClassification = record.classification;
      const relations = proposal.experienceReferences.map((reference, index) => ({ relationId: `mat-rel-${randomUUID()}`, experienceId: prepared[index]?.experienceId ?? reference.experienceId, citations: reference.citations, createdAt: proposal.preparedAt }));
      change.relationIds = relations.map((relation) => relation.relationId);
      return { ...record, classification: proposal.classification, relations: [...record.relations, ...relations] };
    });
    return change;
  }
  async #rollbackRelations(proposal: MaterialRelationProposalV1, change: MaterialChange): Promise<void> {
    await this.repository.compareAndSave(proposal.materialId, proposal.materialHash, (record) => ({ ...record, classification: change.previousClassification ?? "unclassified", relations: record.relations.filter((relation) => !change.relationIds.includes(relation.relationId)) })).catch(() => undefined);
  }
  async #rollbackRecoveredRelations(proposal: MaterialRelationProposalV1, prepared: readonly MaterialPreparedCommit[]): Promise<void> {
    const fingerprints = new Set(proposal.experienceReferences.map((reference, index) => relationFingerprint({
      experienceId: prepared[index]?.experienceId ?? reference.experienceId, citations: reference.citations,
    })));
    await this.repository.compareAndSave(proposal.materialId, proposal.materialHash, (record) => {
      assertProposalMaterialCurrent(proposal, record);
      const relations = record.relations.filter((relation) => !fingerprints.has(relationFingerprint(relation)));
      // A second restarted service may observe the same receipt after the first has
      // already removed these tentative relations. That replay is a no-op, never an external write.
      if (relations.length === record.relations.length) return record;
      return { ...record, classification: relations.length ? (record.classification ?? "unclassified") : "unclassified", relations };
    });
  }
  async #containsRelations(proposal: MaterialRelationProposalV1, prepared: readonly MaterialPreparedCommit[]): Promise<boolean> {
    const record = await this.repository.get(proposal.materialId);
    try { assertProposalMaterialCurrent(proposal, record); } catch { return false; }
    return proposal.experienceReferences.every((reference, index) => record.relations.some((relation) => relationFingerprint(relation) === relationFingerprint({ experienceId: prepared[index]?.experienceId ?? reference.experienceId, citations: reference.citations })));
  }
  async #resetPending(stored: LiveProposal, prepared: readonly MaterialPreparedCommit[], error?: unknown): Promise<MaterialRelationProposalRecord> {
    for (const entry of prepared) this.commits?.discard?.(entry.proposalId);
    await this.#journal.resetPending(stored.proposal.proposalId).catch(() => undefined);
    stored.status = "pending";
    if (error) throw error;
    return cloneProposal(stored);
  }
  async #needsDecision(stored: LiveProposal, reason: string, _error?: unknown): Promise<MaterialRelationProposalRecord> {
    await this.#journal.needsUserDecision(stored.proposal.proposalId, reason).catch(() => undefined);
    stored.status = "needs_user_decision";
    return cloneProposal(stored);
  }
  #fromExistingClaim(stored: LiveProposal, entry: MaterialApprovalJournalEntry): MaterialRelationProposalRecord {
    stored.status = entry.status;
    if (entry.status === "approved") return cloneProposal(stored);
    throw new Error(entry.status === "needs_user_decision" ? "材料关系提案需要用户决定" : "材料关系提案正在恢复");
  }
}

function assertProposalMaterialCurrent(proposal: MaterialRelationProposalV1, record: MaterialStoredRecord | undefined): asserts record is MaterialStoredRecord {
  if (!record) throw new Error("材料已删除，关系提案失效");
  const identity = record.asset.identity;
  if (identity.ownerId !== proposal.ownerId || identity.materialId !== proposal.materialId || identity.contentHash !== proposal.materialHash || identity.contentVersion !== proposal.materialVersion) throw new Error("材料版本已变化，关系提案失效，请重新确认");
}
function assertProposalMaterialTrust(record: MaterialStoredRecord): void {
  if (record.lifecycleStatus === "needs_confirmation" || record.lifecycleStatus === "processing") throw new Error("OCR 尚未获得用户确认，不能建立经历关系");
  if (record.asset.processing.ocr?.expiresAt && Date.parse(record.asset.processing.ocr.expiresAt) <= Date.now()) throw new Error("OCR 已过期，请重新处理后再建立经历关系");
  if (requiresOcrVerification(record.asset.metadata.mediaKind) && !isTrustedOcr(record.asset.processing.ocr, record.ocrBinding)) throw new Error("OCR 证据不足，不能建立经历关系");
}
function assertReferencesNotLinked(record: MaterialStoredRecord, proposal: MaterialRelationProposalV1, prepared: readonly MaterialPreparedCommit[]): void {
  const existing = new Set(record.relations.map(relationFingerprint));
  for (const [index, reference] of proposal.experienceReferences.entries()) if (existing.has(relationFingerprint({ experienceId: prepared[index]?.experienceId ?? reference.experienceId, citations: reference.citations }))) throw new Error("材料关系已存在，请重新读取当前材料");
}
function relationFingerprint(relation: Pick<MaterialRelationRecord, "experienceId" | "citations">): string { return `${relation.experienceId}:${canonicalMaterialJson(relation.citations as unknown as MaterialCanonicalValue)}`; }
function cloneProposal(value: MaterialRelationProposalRecord): MaterialRelationProposalRecord { return { status: value.status, proposal: structuredClone(value.proposal) }; }
function preparedPrefixIsValid(proposal: MaterialRelationProposalV1, prepared: readonly MaterialPreparedCommit[], requiresHost: boolean): boolean {
  if (!requiresHost) return prepared.length === 0;
  const ids = new Set<string>();
  return prepared.length <= proposal.experienceReferences.length && prepared.every((item, index) => isSafeOpaqueId(item.proposalId)
    && isSafeOpaqueId(item.experienceId)
    && item.idempotencyKey === `${proposal.proposalId}:${index}` && !ids.has(item.proposalId) && Boolean(ids.add(item.proposalId)));
}
function preparedBatchIsComplete(proposal: MaterialRelationProposalV1, prepared: readonly MaterialPreparedCommit[], requiresHost: boolean): boolean {
  return preparedPrefixIsValid(proposal, prepared, requiresHost) && (!requiresHost || prepared.length === proposal.experienceReferences.length);
}
function requiresOcrVerification(mediaKind: string): boolean { return mediaKind === "png" || mediaKind === "jpg" || mediaKind === "jpeg" || mediaKind === "scanned_pdf"; }
function isTrustedOcr(ocr: OCRConfidenceV1 | null, binding: MaterialOcrBinding | undefined): boolean {
  const minimumOverall = binding?.policy?.minimumOverallConfidence ?? 0.8;
  const minimumSegment = binding?.policy?.minimumSegmentConfidence ?? 0.75;
  return Boolean(ocr && ocr.engine !== null && ocr.processingStatus === "completed" && !ocr.needsUserConfirmation && ocr.overallConfidence !== null && ocr.segments.length > 0 && (ocr.confirmedAt !== null || (ocr.overallConfidence >= minimumOverall && ocr.segments.every((segment) => segment.confidence >= minimumSegment))));
}
