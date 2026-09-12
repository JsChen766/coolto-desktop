import { createHash } from "node:crypto";
import type { CurrentUser } from "../../../api/types.js";
import { normalizeRecoveryEmail } from "./deletion-recovery-validation.js";
import type { DeletionRequestView, DeletionStartResponse } from "../../../privacy/types.js";
import type { PrivacyDeletionInput, PrivacyDeletionState } from "../../shared/types/privacy.js";
import type { LocalClearResult } from "./local-clear-service.js";
import type { DeletionRecoveryRecord, DeletionRecoveryStorePort } from "./deletion-recovery-store.js";
export interface PrivacyDeletionApi {
  startDeletion(confirmation: string, idempotencyKey: string): Promise<DeletionStartResponse>;
  confirmDeletion(requestId: string, token: string): Promise<DeletionRequestView>;
  getDeletion(requestId: string, token: string): Promise<DeletionRequestView>;
  retryDeletion(requestId: string, token: string): Promise<DeletionRequestView>;
  ackDeletion(requestId: string, token: string | null, idempotencyKey: string): Promise<{ requestId: string; status: "acknowledged" }>;
}
export class PrivacyDeletionService {
  readonly #api: PrivacyDeletionApi;
  readonly #store: DeletionRecoveryStorePort;
  readonly #currentUser: () => CurrentUser;
  readonly #clearLocal: (ownerId: string, accountEmail: string) => Promise<LocalClearResult>;
  readonly #restrictOrdinaryAccess: (() => Promise<void> | void) | undefined; readonly #restoreOrdinaryAccess: (() => Promise<void> | void) | undefined;
  readonly #listeners = new Set<(state: PrivacyDeletionState) => void>();
  #state = idleState();
  public constructor(options: {
    api: PrivacyDeletionApi;
    store: DeletionRecoveryStorePort;
    currentUser: () => CurrentUser;
    clearLocal: (ownerId: string, accountEmail: string) => Promise<LocalClearResult>;
    restrictOrdinaryAccess?: () => Promise<void> | void; restoreOrdinaryAccess?: () => Promise<void> | void;
  }) {
    this.#api = options.api;
    this.#store = options.store;
    this.#currentUser = options.currentUser;
    this.#clearLocal = options.clearLocal;
    this.#restrictOrdinaryAccess = options.restrictOrdinaryAccess; this.#restoreOrdinaryAccess = options.restoreOrdinaryAccess;
  }
  public onStateChange(listener: (state: PrivacyDeletionState) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  public state(): PrivacyDeletionState { return structuredClone(this.#state); }
  public async start(input: PrivacyDeletionInput): Promise<PrivacyDeletionState> {
    const user = this.#currentUser();
    const ownerId = user.id;
    const accountEmail = normalizeRecoveryEmail(user.email);
    if (normalizeRecoveryEmail(input.accountEmail) !== accountEmail) throw new Error("请输入当前登录账号邮箱");
    if (input.confirmation !== "DELETE MY ACCOUNT") throw new Error("请输入 DELETE MY ACCOUNT 以确认删除");
    let existing = await this.#store.load();
    if (existing?.phase === "confirmed" || existing?.phase === "confirm_sent") {
      const recovered = await this.recover();
      if (recovered.status !== "awaiting_control_ack") return recovered;
      existing = await this.#store.load();
    }
    if (existing && existing.accountEmail !== accountEmail) throw new Error("删除恢复记录与当前账号不匹配");
    const confirmationDigest = digest(input.confirmation);
    if (existing && existing.confirmationDigest !== confirmationDigest) {
      throw new Error("删除恢复记录与当前确认内容不一致");
    }
    const record = existing ?? this.#store.newRecord(confirmationDigest, accountEmail);
    const awaitingSaved = { ...record, accountEmail, phase: "awaiting_saved" as const, controlToken: null, requestId: null };
    await persistAndVerify(this.#store, awaitingSaved);
    this.#assertOwner(ownerId);
    const started = await this.#api.startDeletion(input.confirmation, record.startIdempotencyKey);
    const awaiting = withStart(awaitingSaved, started);
    await persistAndVerify(this.#store, awaiting);
    this.#assertOwner(ownerId);
    return this.#confirm(awaiting);
  }
  public async recover(): Promise<PrivacyDeletionState> {
    let record = await this.#store.load();
    if (!record) return this.#setState(idleState());
    this.#assertOwner(record.ownerId, record.phase === "confirmed" || record.localWipeComplete);
    if (!record.controlToken || !record.requestId) {
      if (record.phase !== "awaiting_saved") await this.#restoreOrdinaryAccess?.();
      return this.#setState({
        ...idleState(), status: "awaiting_control_ack", message: "请重新确认以获取删除控制令牌",
      });
    }
    try {
      const view = await this.#api.getDeletion(record.requestId, record.controlToken);
      if (view.status === "awaiting_control_ack") {
        if (record.phase !== "awaiting_saved") {
          await this.#restoreOrdinaryAccess?.(); record = { ...record, phase: "awaiting_saved" as const };
          await persistAndVerify(this.#store, record);
        }
        return this.#setState(viewState(view));
      }
      if (record.phase !== "confirmed") {
        await this.#restrictOrdinaryAccess?.();
        record = { ...record, phase: "confirmed" as const };
        await persistAndVerify(this.#store, record);
      }
      await this.#finish(record, view);
    } catch (error: unknown) {
      if (isControlExpired(error) && record.phase !== "confirmed") {
        await this.#restoreOrdinaryAccess?.(); await this.#resetAwaiting(record);
        return this.#setState({
          ...idleState(), status: "awaiting_control_ack", retryable: true, message: errorMessage(error),
        });
      }
      if (record.phase !== "awaiting_saved" && record.phase !== "confirmed") {
        await this.#restrictOrdinaryAccess?.();
      }
      this.#setState({
        ...this.#state,
        status: record.phase === "awaiting_saved" ? "awaiting_control_ack" : "pending_deletion",
        requestId: record.requestId, retryable: true, message: errorMessage(error),
      });
    }
    return this.state();
  }

  public async retry(): Promise<PrivacyDeletionState> {
    let record = await this.requireRecord();
    this.#assertOwner(record.ownerId, record.phase === "confirmed" || record.localWipeComplete);
    if (!record.controlToken || !record.requestId) return this.#restart(record);
    try {
      const current = await this.#api.getDeletion(record.requestId, record.controlToken);
      if (current.status === "awaiting_control_ack") {
        if (record.phase !== "awaiting_saved") {
          await this.#restoreOrdinaryAccess?.(); record = { ...record, phase: "awaiting_saved" as const };
          await persistAndVerify(this.#store, record);
        }
        return this.#confirm(record);
      }
      if (record.phase !== "confirmed") {
        await this.#restrictOrdinaryAccess?.();
        record = { ...record, phase: "confirmed" as const };
        await persistAndVerify(this.#store, record);
      }
      await this.#finish(record, current);
    } catch (error: unknown) {
      if (isControlExpired(error) && record.phase !== "confirmed") {
        await this.#restoreOrdinaryAccess?.(); return this.#restart(record);
      }
      if (record.phase !== "awaiting_saved" && record.phase !== "confirmed") {
        await this.#restrictOrdinaryAccess?.();
      }
      this.#setState({
        ...this.#state,
        status: record.phase === "awaiting_saved" ? "awaiting_control_ack" : "pending_deletion",
        requestId: record.requestId, retryable: true, message: errorMessage(error),
      });
      throw error;
    }
    return this.state();
  }
  public async acknowledge(): Promise<PrivacyDeletionState> {
    const record = await this.requireRecord();
    this.#assertOwner(record.ownerId, true);
    if (record.phase !== "confirmed" || !record.localWipeComplete) throw new Error("本机数据尚未全部清除");
    if (!record.requestId) throw new Error("删除请求不存在");
    let acknowledged: { requestId: string; status: "acknowledged" };
    try {
      acknowledged = await this.#api.ackDeletion(record.requestId, record.controlToken, record.ackIdempotencyKey);
    } catch (error: unknown) {
      if (!record.controlToken) throw error;
      acknowledged = await this.#api.ackDeletion(record.requestId, null, record.ackIdempotencyKey);
    }
    await this.#store.clear();
    return this.#setState({ ...this.#state, status: "completed", requestId: acknowledged.requestId, retryable: false, message: "删除已完成" });
  }
  private async requireRecord(): Promise<DeletionRecoveryRecord> { const record = await this.#store.load(); if (!record) throw new Error("没有待恢复的删除请求"); return record; }
  #assertOwner(ownerId: string, allowSignedOut = false): void {
    let current: CurrentUser;
    try { current = this.#currentUser(); } catch { if (allowSignedOut) return; throw new Error("删除恢复需要当前账号会话"); }
    if (current.id !== ownerId) throw new Error("账号切换期间拒绝删除");
  }
  async #confirm(record: DeletionRecoveryRecord): Promise<PrivacyDeletionState> {
    if (!record.requestId || !record.controlToken) throw new Error("删除控制令牌尚未准备好");
    const confirmSent = { ...record, phase: "confirm_sent" as const };
    await persistAndVerify(this.#store, confirmSent);
    this.#assertOwner(record.ownerId);
    let view: DeletionRequestView;
    try {
      view = await this.#api.confirmDeletion(record.requestId, record.controlToken);
    } catch (error: unknown) {
      if (isControlExpired(error)) {
        await this.#restoreOrdinaryAccess?.(); await this.#resetAwaiting(confirmSent);
      } else await this.#restrictOrdinaryAccess?.();
      throw error;
    }
    const confirmedRecord = { ...confirmSent, phase: "confirmed" as const };
    try {
      await persistAndVerify(this.#store, confirmedRecord);
    } catch (error: unknown) {
      await this.#restrictOrdinaryAccess?.();
      throw error;
    }
    await this.#restrictOrdinaryAccess?.();
    await this.#finish(confirmedRecord, view);
    return this.state();
  }
  async #restart(record: DeletionRecoveryRecord): Promise<PrivacyDeletionState> {
    const awaiting = await this.#resetAwaiting(record); this.#assertOwner(record.ownerId);
    const started = await this.#api.startDeletion("DELETE MY ACCOUNT", awaiting.startIdempotencyKey);
    const next = withStart(awaiting, started); await persistAndVerify(this.#store, next);
    this.#assertOwner(record.ownerId); return this.#confirm(next);
  }
  async #resetAwaiting(record: DeletionRecoveryRecord): Promise<DeletionRecoveryRecord> {
    const awaiting = { ...record, phase: "awaiting_saved" as const, requestId: null, controlToken: null };
    await persistAndVerify(this.#store, awaiting); return awaiting;
  }
  async #finish(record: DeletionRecoveryRecord, view: DeletionRequestView): Promise<void> {
    this.#assertOwner(record.ownerId, record.phase === "confirmed" || record.localWipeComplete);
    this.#state = viewState(view);
    if (view.status === "awaiting_control_ack") { this.#emit(); return; }
    if (record.phase !== "confirmed") {
      record = { ...record, phase: "confirmed" as const };
      await persistAndVerify(this.#store, record);
    }
    if (!record.localWipeComplete) {
      const result = await this.#clearLocal(record.ownerId, record.accountEmail);
      if (result.status !== "cleared") {
        this.#state = { ...this.#state, status: "partial_failure", retryable: true, message: "本机数据尚未全部清除，请重试" };
        await persistAndVerify(this.#store, record);
        this.#emit();
        return;
      }
      record = { ...record, localWipeComplete: true };
      await persistAndVerify(this.#store, record);
    }
    this.#emit();
    if (view.status === "completed") await this.acknowledge();
  }
  #setState(state: PrivacyDeletionState): PrivacyDeletionState {
    this.#state = state;
    this.#emit();
    return this.state();
  }
  #emit(): void {
    const state = this.state();
    for (const listener of this.#listeners) listener(state);
  }
}
export function emptyDeletionState(): PrivacyDeletionState { return idleState(); }
function withStart(record: DeletionRecoveryRecord, response: DeletionStartResponse): DeletionRecoveryRecord {
  return { ...record, phase: "awaiting_saved", requestId: response.requestId, controlToken: response.deletionControlToken };
}
function viewState(view: DeletionRequestView): PrivacyDeletionState { return { ...view, message: null }; }
function idleState(): PrivacyDeletionState { return { status: "idle", requestId: null, retryable: false, steps: [], thirdPartyDataUnaffected: true, message: null, updatedAt: null, completedAt: null }; }
function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "删除恢复失败"; }
function isControlExpired(error: unknown): boolean { if (!error || typeof error !== "object") return false; const value = error as { code?: unknown; message?: unknown }; return value.code === "deletion_control_expired" || (typeof value.message === "string" && value.message.includes("deletion_control_expired")); }
async function persistAndVerify(store: DeletionRecoveryStorePort, record: DeletionRecoveryRecord): Promise<void> {
  await store.save(record); assertPersistedRecord(record, await store.load());
}
function assertPersistedRecord(expected: DeletionRecoveryRecord, actual: DeletionRecoveryRecord | undefined): void {
  if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("删除恢复记录未能重新读取验证，未发送确认");
}
