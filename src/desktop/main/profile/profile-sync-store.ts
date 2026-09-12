import type { UserProfile } from "../../../api/types.js";
import type {
  ProfileContactView,
  ProfileReaderV2,
  ProfileSyncIssueView,
  UserProfileV2,
} from "../../../profile/types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { LocalEntity, SyncIssue } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import {
  toProfileLocalPayload,
  toProfileServerPushPayload,
  toUserProfile,
} from "./profile-sync-mapping.js";

export class ProfileSyncStore implements ProfileReaderV2 {
  public constructor(
    private readonly ownerId: string,
    private readonly local: LocalSyncStore,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async getUserProfile(_signal?: AbortSignal): Promise<UserProfileV2> {
    await this.initialSync();
    return this.readProfile(this.currentEntity());
  }

  public async getProfileView(): Promise<ProfileContactView> {
    await this.initialSync();
    const entity = this.currentEntity();
    const profile = this.readProfile(entity);
    const issue = this.getSyncIssue();
    return {
      ...profile,
      syncStatus: entity.syncStatus,
      entityVersion: entity.entityVersion,
      ...(issue ? { syncIssue: this.issueView(entity, issue) } : {}),
    };
  }

  public async getProfileContext(_signal?: AbortSignal): Promise<{
    profile: UserProfileV2;
    syncStatus: ProfileContactView["syncStatus"];
    entityVersion: number;
    localVersion: number;
  }> {
    await this.initialSync();
    const entity = this.currentEntity();
    const profile = this.readProfile(entity);
    return {
      profile,
      syncStatus: entity.syncStatus,
      entityVersion: entity.entityVersion,
      localVersion: entity.localVersion,
    };
  }

  public currentEntity(): LocalEntity {
    const entity = this.local.getEntity("user_profile", this.ownerId);
    if (!entity || entity.operation === "delete") throw new Error("个人资料不存在");
    return entity;
  }

  public enqueueUpdate(entity: LocalEntity, profile: UserProfile): UserProfile {
    const payload = toProfileServerPushPayload(profile);
    const localPayload = toProfileLocalPayload(profile);
    this.local.enqueue({
      operationId: createUuidV7(), entityType: "user_profile", entityId: this.ownerId,
      action: "update", expectedVersion: entity.entityVersion, payload, localPayload,
    });
    this.trigger();
    return toUserProfile(this.currentEntity());
  }

  public acceptServer(): void {
    this.local.acceptServer("user_profile", this.ownerId);
    this.trigger();
  }

  public getSyncIssue() {
    return this.local.getSyncIssue("user_profile", this.ownerId);
  }

  public replaceBlocked(entity: LocalEntity, profile: UserProfile, expectedVersion: number): void {
    const payload = toProfileServerPushPayload(profile);
    const localPayload = toProfileLocalPayload(profile);
    this.local.replaceBlocked({
      operationId: createUuidV7(), entityType: "user_profile", entityId: this.ownerId,
      action: "update", expectedVersion, payload, localPayload,
    });
    this.trigger();
  }

  private readProfile(entity: LocalEntity): UserProfileV2 {
    const profile = toUserProfile(entity);
    if (profile.entityVersion === undefined || profile.updatedAt === undefined ||
        !profile.careerTargets) {
      throw new Error("Profile projection 缺少版本或目标字段");
    }
    return profile as UserProfileV2;
  }

  private issueView(entity: LocalEntity, issue: SyncIssue): ProfileSyncIssueView {
    const serverProfile = issue.serverOperation === "upsert" && issue.serverPayload
      ? toUserProfile({ ...entity, entityVersion: issue.serverVersion, payload: issue.serverPayload })
      : null;
    return {
      status: issue.status, action: issue.action, serverVersion: issue.serverVersion,
      serverOperation: issue.serverOperation, errorCode: issue.errorCode,
      localProfile: toUserProfile(entity), serverProfile,
    };
  }
}
