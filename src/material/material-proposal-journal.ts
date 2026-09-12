import { join } from "node:path";

import type { MaterialRelationProposalV1 } from "./material-relations.js";
import { readMaterialEncrypted, writeMaterialEncrypted } from "./material-repository-crypto.js";
import { materialOwnerRootLockPath, withMaterialRootLock } from "./material-root-lock.js";

export type MaterialApprovalStatus = "pending" | "executing" | "needs_user_decision" | "approved" | "rejected";
export type MaterialApprovalPhase = "pending" | "claimed" | "prepared" | "material_saving" | "material_saved" | "executing" | "approved" | "needs_user_decision" | "rejected";
export interface MaterialPreparedCommit { proposalId: string; experienceId: string; idempotencyKey: string; }
export interface MaterialApprovalReceipt { completedAt: string; preparedProposalIds: string[]; reconciled: boolean; }
export interface MaterialApprovalJournalEntry {
  proposal: MaterialRelationProposalV1;
  status: MaterialApprovalStatus;
  phase: MaterialApprovalPhase;
  prepared: MaterialPreparedCommit[];
  receipt: MaterialApprovalReceipt | null;
  updatedAt: string;
  reason: string | null;
}
/** Crash-recovery execution receipt only; material/Experience facts remain in their existing authorities. */
export interface MaterialApprovalJournal {
  create(proposal: MaterialRelationProposalV1): Promise<MaterialApprovalJournalEntry>;
  get(proposalId: string): Promise<MaterialApprovalJournalEntry | undefined>;
  claim(proposalId: string): Promise<{ claimed: boolean; entry: MaterialApprovalJournalEntry }>;
  setPrepared(proposalId: string, prepared: readonly MaterialPreparedCommit[]): Promise<MaterialApprovalJournalEntry>;
  setMaterialSaving(proposalId: string): Promise<MaterialApprovalJournalEntry>;
  setMaterialSaved(proposalId: string): Promise<MaterialApprovalJournalEntry>;
  setExecuting(proposalId: string): Promise<MaterialApprovalJournalEntry>;
  approve(proposalId: string, reconciled?: boolean): Promise<MaterialApprovalJournalEntry>;
  resetPending(proposalId: string): Promise<MaterialApprovalJournalEntry>;
  needsUserDecision(proposalId: string, reason: string): Promise<MaterialApprovalJournalEntry>;
  reject(proposalId: string): Promise<MaterialApprovalJournalEntry>;
  clear(): Promise<void>;
}

export class MemoryMaterialApprovalJournal implements MaterialApprovalJournal {
  readonly #entries = new Map<string, MaterialApprovalJournalEntry>();

  public async create(proposal: MaterialRelationProposalV1): Promise<MaterialApprovalJournalEntry> {
    if (this.#entries.has(proposal.proposalId)) throw new Error("材料关系提案已存在");
    const entry = createEntry(proposal);
    this.#entries.set(proposal.proposalId, entry);
    return cloneEntry(entry);
  }
  public async get(proposalId: string): Promise<MaterialApprovalJournalEntry | undefined> {
    const entry = this.#entries.get(proposalId);
    return entry ? cloneEntry(entry) : undefined;
  }
  public async claim(proposalId: string): Promise<{ claimed: boolean; entry: MaterialApprovalJournalEntry }> {
    const entry = this.#required(proposalId);
    if (entry.status !== "pending") return { claimed: false, entry: cloneEntry(entry) };
    update(entry, "executing", "claimed");
    return { claimed: true, entry: cloneEntry(entry) };
  }
  public async setPrepared(proposalId: string, prepared: readonly MaterialPreparedCommit[]): Promise<MaterialApprovalJournalEntry> {
    const entry = this.#executing(proposalId); entry.prepared = prepared.map((item) => ({ ...item })); update(entry, "executing", "prepared"); return cloneEntry(entry);
  }
  public async setMaterialSaving(proposalId: string): Promise<MaterialApprovalJournalEntry> { const entry = this.#executing(proposalId); update(entry, "executing", "material_saving"); return cloneEntry(entry); }
  public async setMaterialSaved(proposalId: string): Promise<MaterialApprovalJournalEntry> { const entry = this.#executing(proposalId); update(entry, "executing", "material_saved"); return cloneEntry(entry); }
  public async setExecuting(proposalId: string): Promise<MaterialApprovalJournalEntry> { const entry = this.#executing(proposalId); update(entry, "executing", "executing"); return cloneEntry(entry); }
  public async approve(proposalId: string, reconciled = false): Promise<MaterialApprovalJournalEntry> {
    const entry = this.#executing(proposalId);
    update(entry, "approved", "approved");
    entry.receipt = { completedAt: entry.updatedAt, preparedProposalIds: entry.prepared.map((item) => item.proposalId), reconciled };
    return cloneEntry(entry);
  }
  public async resetPending(proposalId: string): Promise<MaterialApprovalJournalEntry> {
    const entry = this.#required(proposalId);
    // Two restarted services can both reconcile the same durable not-executed
    // receipt. The first reset wins; the second is an idempotent local no-op.
    if (entry.status === "pending" && entry.phase === "pending") return cloneEntry(entry);
    if (entry.status !== "executing") throw new Error("材料关系提案执行状态无效");
    entry.prepared = [];
    update(entry, "pending", "pending");
    return cloneEntry(entry);
  }
  public async needsUserDecision(proposalId: string, reason: string): Promise<MaterialApprovalJournalEntry> { const entry = this.#executing(proposalId); update(entry, "needs_user_decision", "needs_user_decision", reason); return cloneEntry(entry); }
  public async reject(proposalId: string): Promise<MaterialApprovalJournalEntry> { const entry = this.#required(proposalId); if (entry.status !== "pending") throw new Error("材料关系提案不存在或已经处理"); update(entry, "rejected", "rejected"); return cloneEntry(entry); }
  public async clear(): Promise<void> { this.#entries.clear(); }
  public async all(): Promise<MaterialApprovalJournalEntry[]> { return [...this.#entries.values()].map(cloneEntry); }
  public async restore(entry: MaterialApprovalJournalEntry): Promise<void> {
    if (this.#entries.has(entry.proposal.proposalId)) throw new Error("Material proposal journal is malformed");
    this.#entries.set(entry.proposal.proposalId, cloneEntry(entry));
  }
  #required(proposalId: string): MaterialApprovalJournalEntry { const entry = this.#entries.get(proposalId); if (!entry) throw new Error("材料关系提案不存在或已经处理"); return entry; }
  #executing(proposalId: string): MaterialApprovalJournalEntry { const entry = this.#required(proposalId); if (entry.status !== "executing") throw new Error("材料关系提案执行状态无效"); return entry; }
}

export class EncryptedMaterialApprovalJournal extends MemoryMaterialApprovalJournal {
  readonly #file: string;
  readonly #lock: string;
  readonly #key: Buffer;
  readonly #aad: string;

  public constructor(root: string, key: Buffer, aad: string) {
    super();
    this.#file = join(root, "proposal-journal.enc");
    this.#lock = materialOwnerRootLockPath(root);
    this.#key = key;
    this.#aad = aad;
  }
  public override async create(proposal: MaterialRelationProposalV1): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.create(proposal)); }
  public override async get(proposalId: string): Promise<MaterialApprovalJournalEntry | undefined> { return this.#withJournal((journal) => journal.get(proposalId)); }
  public override async claim(proposalId: string): Promise<{ claimed: boolean; entry: MaterialApprovalJournalEntry }> { return this.#mutate((journal) => journal.claim(proposalId)); }
  public override async setPrepared(proposalId: string, prepared: readonly MaterialPreparedCommit[]): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.setPrepared(proposalId, prepared)); }
  public override async setMaterialSaving(proposalId: string): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.setMaterialSaving(proposalId)); }
  public override async setMaterialSaved(proposalId: string): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.setMaterialSaved(proposalId)); }
  public override async setExecuting(proposalId: string): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.setExecuting(proposalId)); }
  public override async approve(proposalId: string, reconciled?: boolean): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.approve(proposalId, reconciled)); }
  public override async resetPending(proposalId: string): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.resetPending(proposalId)); }
  public override async needsUserDecision(proposalId: string, reason: string): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.needsUserDecision(proposalId, reason)); }
  public override async reject(proposalId: string): Promise<MaterialApprovalJournalEntry> { return this.#mutate((journal) => journal.reject(proposalId)); }
  public override async clear(): Promise<void> { await this.#mutate((journal) => journal.clear()); }

  async #mutate<T>(operation: (journal: MemoryMaterialApprovalJournal) => Promise<T>): Promise<T> {
    return this.#withLock(async () => {
      const journal = await this.#read();
      const result = await operation(journal);
      await this.#write(journal);
      return result;
    });
  }
  async #withJournal<T>(operation: (journal: MemoryMaterialApprovalJournal) => Promise<T>): Promise<T> {
    return this.#withLock(async () => operation(await this.#read()));
  }
  async #read(): Promise<MemoryMaterialApprovalJournal> {
    const journal = new MemoryMaterialApprovalJournal();
    try {
      const value = await readMaterialEncrypted(this.#file, this.#key, this.#aad);
      if (!Array.isArray(value)) throw new Error("Material proposal journal is malformed");
      for (const entry of value as MaterialApprovalJournalEntry[]) await journal.restore(entry);
      return journal;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return journal;
      throw error;
    }
  }
  async #write(journal: MemoryMaterialApprovalJournal): Promise<void> {
    await writeMaterialEncrypted(this.#file, await journal.all(), this.#key, this.#aad);
  }
  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    return withMaterialRootLock(this.#lock, operation, 5_000);
  }
}

function createEntry(proposal: MaterialRelationProposalV1): MaterialApprovalJournalEntry { return { proposal: structuredClone(proposal), status: "pending", phase: "pending", prepared: [], receipt: null, updatedAt: new Date().toISOString(), reason: null }; }
function update(entry: MaterialApprovalJournalEntry, status: MaterialApprovalStatus, phase: MaterialApprovalPhase, reason: string | null = null): void { entry.status = status; entry.phase = phase; entry.reason = reason; entry.updatedAt = new Date().toISOString(); }
function cloneEntry(entry: MaterialApprovalJournalEntry): MaterialApprovalJournalEntry { return structuredClone(entry); }
