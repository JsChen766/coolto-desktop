import type { LocalEntity, EnqueueMutation, SyncIssue } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type {
  PreferenceListFilterV1,
  PreferenceReaderV1,
  PreferenceV1,
} from "../../../preference/types.js";
import type {
  PreferenceDesktopView,
  PreferenceSyncIssueView,
} from "../../shared/types/preferences.js";
import type { PreferenceSuggestionStore } from "../agent-task/preference-suggestion-store.js";
import {
  toPreference,
  toPreferenceDeletePayload,
  toPreferenceLocalPayload,
  toPreferenceMutationPayload,
} from "./preference-sync-mapping.js";

export class PreferenceSyncStore implements PreferenceReaderV1 {
  public constructor(
    public readonly ownerId: string,
    private readonly local: LocalSyncStore,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async listPreferences(filter: PreferenceListFilterV1 = {}): Promise<PreferenceV1[]> {
    await this.initialSync();
    return this.listLocalEntries(filter)
      .filter((entity) => entity.syncStatus !== "conflict" && entity.syncStatus !== "failed")
      .map((entity) => toPreference(entity, this.ownerId))
      .filter((preference) => preference.status === "active" && preference.deletedAt === null)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public async listAll(filter: PreferenceListFilterV1 = {}): Promise<PreferenceV1[]> {
    await this.initialSync();
    return this.listLocal(filter);
  }

  public async listViews(
    filter: PreferenceListFilterV1 = {},
    usage?: PreferenceSuggestionStore,
  ): Promise<PreferenceDesktopView[]> {
    const preferences = await this.listAll(filter);
    return Promise.all(preferences.map((preference) => this.view(preference, usage)));
  }

  public async getPreference(id: string): Promise<PreferenceV1 | null> {
    await this.initialSync();
    const entity = this.local.getEntity("user_preference", id);
    if (!entity || entity.operation === "delete") return null;
    return toPreference(entity, this.ownerId);
  }

  public async getPreferenceView(
    id: string,
    usage?: PreferenceSuggestionStore,
  ): Promise<PreferenceDesktopView | null> {
    const preference = await this.getPreference(id);
    return preference ? this.view(preference, usage) : null;
  }

  public currentEntity(id: string): LocalEntity {
    const entity = this.local.getEntity("user_preference", id);
    if (!entity || entity.operation === "delete") throw new Error("Preference 不存在");
    if (toPreference(entity, this.ownerId).deletedAt !== null) throw new Error("Preference 已删除");
    return entity;
  }

  public getSyncIssue(id: string): SyncIssue | undefined {
    return this.local.getSyncIssue("user_preference", id);
  }

  public enqueueCreate(operationId: string, preference: PreferenceV1): void {
    this.enqueue({
      operationId, entityId: preference.id, action: "create", expectedVersion: null,
      payload: toPreferenceMutationPayload(preference, this.ownerId),
      localPayload: toPreferenceLocalPayload(preference),
    });
  }

  public enqueueUpdate(operationId: string, entity: LocalEntity, preference: PreferenceV1): void {
    this.enqueue({
      operationId, entityId: entity.entityId, action: "update", expectedVersion: entity.entityVersion,
      payload: toPreferenceMutationPayload(preference, this.ownerId),
      localPayload: toPreferenceLocalPayload(preference),
    });
  }

  public enqueueDelete(operationId: string, entity: LocalEntity, preference: PreferenceV1): void {
    this.enqueue({
      operationId, entityId: entity.entityId, action: "delete", expectedVersion: entity.entityVersion,
      payload: toPreferenceDeletePayload(this.ownerId), localPayload: toPreferenceLocalPayload(preference),
    });
  }

  public acceptServer(id: string): void {
    this.local.acceptServer("user_preference", id);
    this.trigger();
  }

  public replaceBlocked(operationId: string, entity: LocalEntity, preference: PreferenceV1, expectedVersion: number): void {
    this.local.replaceBlocked({
      operationId, entityType: "user_preference", entityId: entity.entityId,
      action: "update", expectedVersion,
      payload: toPreferenceMutationPayload(preference, this.ownerId),
      localPayload: toPreferenceLocalPayload(preference),
    });
    this.trigger();
  }

  private async view(
    preference: PreferenceV1,
    usage?: PreferenceSuggestionStore,
  ): Promise<PreferenceDesktopView> {
    const entity = this.local.getEntity("user_preference", preference.id);
    const issue = entity ? this.getSyncIssue(preference.id) : undefined;
    const result: PreferenceDesktopView = {
      ...preference,
      syncStatus: entity?.syncStatus ?? "clean",
      localUsage: usage ? await usage.usage(preference.id) : null,
    };
    if (issue) result.syncIssue = issueView(entity!, preference, issue, this.ownerId);
    return result;
  }

  private enqueue(input: Omit<EnqueueMutation, "entityType">): void {
    this.local.enqueue({ ...input, entityType: "user_preference" });
    this.trigger();
  }

  private listLocal(filter: PreferenceListFilterV1): PreferenceV1[] {
    return this.listLocalEntries(filter)
      .map((entity) => toPreference(entity, this.ownerId))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private listLocalEntries(filter: PreferenceListFilterV1): LocalEntity[] {
    return this.local.listEntities("user_preference")
      .filter((entity) => entity.operation === "upsert")
      .filter((entity) => matchesFilter(toPreference(entity, this.ownerId), filter));
  }
}

function issueView(
  entity: LocalEntity,
  localPreference: PreferenceV1,
  issue: SyncIssue,
  ownerId: string,
): PreferenceSyncIssueView {
  const serverPreference = issue.serverOperation === "upsert" && issue.serverPayload
    ? toPreference({ ...entity, entityVersion: issue.serverVersion, payload: issue.serverPayload }, ownerId)
    : null;
  return {
    status: issue.status, errorCode: issue.errorCode, serverVersion: issue.serverVersion,
    serverOperation: issue.serverOperation,
    serverPreference, localPreference,
  };
}

function matchesFilter(preference: PreferenceV1, filter: PreferenceListFilterV1): boolean {
  if (filter.kind && preference.scope.kind !== filter.kind) return false;
  if (filter.targetFingerprint && preference.scope.targetFingerprint !== filter.targetFingerprint) return false;
  if (filter.domain && preference.scope.domain !== filter.domain) return false;
  return filter.includeDisabled === true || preference.deletedAt === null;
}
