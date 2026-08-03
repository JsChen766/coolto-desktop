import type { UserProfile, UserProfileReader } from "../../../api/types.js";
import type { ProfileContactView } from "../../../profile/types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import { toProfileWritePayload, toUserProfile } from "./profile-sync-mapping.js";

export class ProfileSyncStore implements UserProfileReader {
  public constructor(
    private readonly ownerId: string,
    private readonly local: LocalSyncStore,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async getUserProfile(_signal?: AbortSignal): Promise<UserProfile> {
    await this.initialSync();
    return toUserProfile(this.currentEntity());
  }

  public async getProfileView(): Promise<ProfileContactView> {
    await this.initialSync();
    const entity = this.currentEntity();
    return { ...toUserProfile(entity), syncStatus: entity.syncStatus };
  }

  public currentEntity(): LocalEntity {
    const entity = this.local.getEntity("user_profile", this.ownerId);
    if (!entity || entity.operation === "delete") throw new Error("个人资料不存在");
    return entity;
  }

  public enqueueUpdate(entity: LocalEntity, profile: UserProfile): UserProfile {
    this.local.enqueue({
      operationId: createUuidV7(), entityType: "user_profile", entityId: this.ownerId,
      action: "update", expectedVersion: entity.entityVersion,
      payload: toProfileWritePayload(profile), localPayload: toProfileWritePayload(profile),
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
    this.local.replaceBlocked({
      operationId: createUuidV7(), entityType: "user_profile", entityId: this.ownerId,
      action: "update", expectedVersion, payload: toProfileWritePayload(profile),
      localPayload: toProfileWritePayload(profile),
    });
    this.trigger();
  }
}
