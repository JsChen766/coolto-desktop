import { createUuidV7 } from "../../../sync/uuid-v7.js";
import {
  normalizePreferenceValue,
  preferenceAllowsScope,
} from "../../../preference/key-registry.js";
import { normalizeScope } from "../../../preference/normalizer.js";
import type {
  PreferenceMutationInputV1,
  PreferenceV1,
  PreferenceWriteProposalV1,
} from "../../../preference/types.js";
import {
  createPreferenceSnapshot,
  deletePreferenceSnapshot,
  toPreference,
  updatePreferenceSnapshot,
} from "./preference-sync-mapping.js";
import { PreferenceSyncStore } from "./preference-sync-store.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { PreferenceSuggestionStore } from "../agent-task/preference-suggestion-store.js";

interface Entry {
  proposal: PreferenceWriteProposalV1;
  entity?: LocalEntity;
  operationId: string;
  preparedEntityVersion: number;
  mode: "create" | "update" | "delete" | "accept" | "reapply";
  expectedVersion: number | null;
  suggestionId?: string;
}

export class PreferenceProposalService {
  readonly #entries = new Map<string, Entry>();
  readonly #executing = new Set<string>();

  public constructor(
    private readonly ownerId: string,
    private readonly preferences: PreferenceSyncStore,
    private readonly initialSync: () => Promise<void>,
    private readonly suggestions?: PreferenceSuggestionStore,
  ) {}

  public async prepareCreate(input: PreferenceMutationInputV1): Promise<PreferenceWriteProposalV1> {
    await this.initialSync();
    const normalized = normalizeInput(input);
    const now = new Date().toISOString();
    const next = createPreferenceSnapshot(this.ownerId, createUuidV7(), normalized, now);
    await this.assertNotDuplicate(next);
    return this.add("create", null, next, undefined, null, "create", "创建长期偏好");
  }

  public async prepareCreateFromSuggestion(
    input: PreferenceMutationInputV1,
    suggestionId: string,
  ): Promise<PreferenceWriteProposalV1> {
    if (!this.suggestions) throw new Error("Preference suggestion store 尚未启用");
    await this.suggestions.reconcileAccepted(this.preferences);
    const suggestion = await this.suggestions.assertPending(suggestionId);
    await this.initialSync();
    const normalized = normalizeInput({ ...input, source: "behavior_confirmed" });
    if (normalized.key !== suggestion.key ||
        JSON.stringify(normalized.value) !== JSON.stringify(suggestion.proposedValue) ||
        JSON.stringify(normalized.scope) !== JSON.stringify(suggestion.scope) ||
        normalized.sourceSuggestionHash !== suggestion.patternHash) {
      throw new Error("Preference suggestion 与确认内容不一致");
    }
    const now = new Date().toISOString();
    const next = createPreferenceSnapshot(this.ownerId, createUuidV7(), normalized, now);
    await this.assertNotDuplicate(next);
    return this.add("create", null, next, undefined, null, "create", "确认行为建议为长期偏好", suggestionId);
  }

  public async prepareUpdate(
    id: string,
    input: Partial<PreferenceMutationInputV1> & { status?: "active" | "disabled" },
  ): Promise<PreferenceWriteProposalV1> {
    await this.initialSync();
    const entity = this.#editable(id);
    const current = toPreference(entity, this.ownerId);
    const next = updatePreferenceSnapshot(current, normalizePartialInput(input), new Date().toISOString());
    await this.assertNotDuplicate(next, id);
    return this.add("update", current, next, entity, entity.entityVersion, "update", "更新长期偏好");
  }

  public prepareDisable(id: string): Promise<PreferenceWriteProposalV1> {
    return this.prepareUpdate(id, { status: "disabled" });
  }

  public prepareEnable(id: string): Promise<PreferenceWriteProposalV1> {
    return this.prepareUpdate(id, { status: "active" });
  }

  public async prepareDelete(id: string): Promise<PreferenceWriteProposalV1> {
    await this.initialSync();
    const entity = this.#editable(id);
    const current = toPreference(entity, this.ownerId);
    const next = deletePreferenceSnapshot(current, new Date().toISOString());
    return this.add("delete", current, next, entity, entity.entityVersion, "delete", "删除长期偏好");
  }

  public async prepareAcceptServer(id: string): Promise<PreferenceWriteProposalV1> {
    await this.initialSync();
    const entity = this.preferences.currentEntity(id);
    const issue = this.preferences.getSyncIssue(id);
    if (!issue || issue.serverVersion < 1 || !issue.serverOperation) {
      throw new Error("服务端版本尚未拉取，只能先重试同步");
    }
    const server = issue.serverOperation === "upsert" && issue.serverPayload
      ? toPreference({ ...entity, entityVersion: issue.serverVersion, payload: issue.serverPayload }, this.ownerId)
      : null;
    return this.add("accept_server", toPreference(entity, this.ownerId), server, entity, entity.entityVersion, "accept", "接受服务端 Preference");
  }

  public async prepareReapply(id: string): Promise<PreferenceWriteProposalV1> {
    await this.initialSync();
    const entity = this.preferences.currentEntity(id);
    const issue = this.preferences.getSyncIssue(id);
    if (!issue || issue.serverOperation !== "upsert" || !issue.serverPayload) throw new Error("最新服务端 Preference 尚未拉取");
    const local = toPreference(entity, this.ownerId);
    const server = toPreference({ ...entity, entityVersion: issue.serverVersion, payload: issue.serverPayload }, this.ownerId);
    const next = updatePreferenceSnapshot(server, {
      key: local.key, value: local.value, scope: local.scope, priority: local.priority,
      source: local.source, sourceSuggestionHash: local.sourceSuggestionHash, status: local.status,
    }, new Date().toISOString());
    await this.assertNotDuplicate(next, id);
    return this.add("reapply", server, next, entity, issue.serverVersion, "reapply", "基于最新服务端版本重新应用 Preference");
  }

  public async execute(id: string): Promise<PreferenceV1 | null> {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error("Preference 确认不存在或已失效");
    if (this.#executing.has(id)) throw new Error("这项确认正在执行，请稍候");
    this.#executing.add(id);
    try {
      if (entry.mode !== "create") {
        const entity = this.preferences.currentEntity(entry.proposal.preferenceId!);
        if (entity.localVersion !== entry.proposal.localVersion || entity.entityVersion !== entry.preparedEntityVersion) throw new Error("Preference 已变化，请重新检查后再确认");
        if (entry.mode === "accept") {
          const issue = this.preferences.getSyncIssue(entity.entityId);
          if (!issue || issue.serverVersion < 1 || !issue.serverOperation) {
            throw new Error("服务端版本尚未拉取，只能先重试同步");
          }
        }
      }
      let suggestionAccepted = false;
      if (entry.suggestionId) {
        await this.suggestions?.accept(entry.suggestionId, entry.proposal.next!.id);
        suggestionAccepted = true;
      }
      try {
        if (entry.mode === "create") this.preferences.enqueueCreate(entry.operationId, entry.proposal.next!);
        else if (entry.mode === "accept") this.preferences.acceptServer(entry.proposal.preferenceId!);
        else if (entry.mode === "delete") this.preferences.enqueueDelete(entry.operationId, entry.entity!, entry.proposal.next!);
        else if (entry.mode === "reapply") this.preferences.replaceBlocked(entry.operationId, entry.entity!, entry.proposal.next!, entry.expectedVersion!);
        else this.preferences.enqueueUpdate(entry.operationId, entry.entity!, entry.proposal.next!);
      } catch (error) {
        if (suggestionAccepted && entry.suggestionId) {
          try {
            await this.suggestions!.restorePending(
              entry.suggestionId, entry.proposal.next!.id,
            );
          } catch (restoreError) {
            try {
              await this.suggestions!.reconcileAccepted(this.preferences);
            } catch {
              // The next suggestion read retries this durable reconciliation.
            }
            const restoreMessage = restoreError instanceof Error
              ? restoreError.message : String(restoreError);
            throw new Error(`Preference 写入失败，建议状态恢复失败：${restoreMessage}`, { cause: error });
          }
        }
        throw error;
      }
      this.#entries.delete(id);
      return entry.proposal.next;
    } finally { this.#executing.delete(id); }
  }

  #editable(id: string): LocalEntity {
    const entity = this.preferences.currentEntity(id);
    if (entity.syncStatus === "conflict" || entity.syncStatus === "failed") {
      throw new Error("请先解决 Preference 同步问题");
    }
    return entity;
  }
  private add(action: PreferenceWriteProposalV1["action"], current: PreferenceV1 | null, next: PreferenceV1 | null, entity: LocalEntity | undefined, expectedVersion: number | null, mode: Entry["mode"], explanation: string, suggestionId?: string): PreferenceWriteProposalV1 {
    const proposal: PreferenceWriteProposalV1 = Object.freeze({
      id: `preference-${createUuidV7()}`, action, ownerId: this.ownerId,
      preferenceId: current?.id ?? next?.id ?? null,
      current: current ? structuredClone(current) : null, next: next ? structuredClone(next) : null,
      expectedEntityVersion: expectedVersion, localVersion: entity?.localVersion ?? 0,
      preparedAt: new Date().toISOString(), explanation,
    });
    this.#entries.set(proposal.id, {
      proposal, ...(entity ? { entity } : {}), operationId: createUuidV7(),
      preparedEntityVersion: entity?.entityVersion ?? 0, mode, expectedVersion,
      ...(suggestionId ? { suggestionId } : {}),
    });
    return proposal;
  }

  private async assertNotDuplicate(next: PreferenceV1, exceptId?: string): Promise<void> {
    const preferences = await this.preferences.listAll();
    if (preferences.some((item) => item.id !== exceptId && item.deletedAt === null && item.status === "active" && item.contentHash === next.contentHash)) throw new Error("已存在内容相同的 Preference");
  }
}

function normalizeInput(input: PreferenceMutationInputV1): PreferenceMutationInputV1 {
  const scope = normalizeScope(input.scope);
  if (!preferenceAllowsScope(input.key, scope.kind)) throw new Error("Preference key 不支持该作用域");
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100) throw new Error("Preference priority 必须是 0 到 100 的整数");
  return {
    key: input.key, value: normalizePreferenceValue(input.key, input.value), scope,
    priority: input.priority, source: input.source ?? "explicit_user",
    sourceSuggestionHash: input.sourceSuggestionHash ?? null,
  };
}

function normalizePartialInput(input: Partial<PreferenceMutationInputV1> & { status?: "active" | "disabled" }): Partial<PreferenceMutationInputV1> & { status?: "active" | "disabled" } {
  const result = { ...input };
  if (input.key !== undefined || input.value !== undefined || input.scope !== undefined) {
    if (!input.key || input.value === undefined || !input.scope) throw new Error("更新 Preference 必须同时提供 key、value、scope");
    const normalized = normalizeInput({
      key: input.key, value: input.value, scope: input.scope, priority: input.priority ?? 0,
      ...(input.source === undefined ? {} : { source: input.source }),
      ...(input.sourceSuggestionHash === undefined ? {} : { sourceSuggestionHash: input.sourceSuggestionHash }),
    });
    if (input.priority === undefined) {
      const { priority: _priority, ...withoutPriority } = normalized;
      Object.assign(result, withoutPriority);
    } else {
      Object.assign(result, normalized);
    }
  }
  if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100)) throw new Error("Preference priority 必须是 0 到 100 的整数");
  return result;
}
