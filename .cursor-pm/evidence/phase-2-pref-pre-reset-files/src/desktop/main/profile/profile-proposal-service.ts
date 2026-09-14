import type { UserProfile } from "../../../api/types.js";
import type {
  ProfileChangeSet,
  ProfileImportField,
  ProfileWriteProposal,
} from "../../../profile/types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import { isProfileLanguage, isProfileResumeStyle } from "../../../profile/profile-defaults.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import {
  mergeProfile,
  toUserProfile,
} from "./profile-sync-mapping.js";
import { ProfileSyncStore } from "./profile-sync-store.js";

type ProposalMode = "enqueue" | "accept" | "reapply";
interface Entry {
  proposal: ProfileWriteProposal;
  localVersion: number;
  preparedEntityVersion: number;
  next: UserProfile | null;
  mode: ProposalMode;
  expectedVersion?: number;
}

export class ProfileProposalService {
  readonly #entries = new Map<string, Entry>();
  readonly #executing = new Set<string>();

  public constructor(
    private readonly profiles: ProfileSyncStore,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async prepareUpdate(
    changes: ProfileChangeSet,
    kind: "manual" | "import" = "manual",
  ): Promise<ProfileWriteProposal> {
    await this.initialSync();
    const entity = this.#editable();
    const current = toUserProfile(entity);
    const next = mergeProfile(current, changes);
    assertWritableProfileDefaults(next);
    return this.#add(kind, entity.localVersion, entity.syncStatus, current, next, "enqueue");
  }

  public async prepareImport(
    changes: ProfileChangeSet,
    expected: readonly ProfileImportField[],
  ): Promise<ProfileWriteProposal> {
    await this.initialSync();
    const entity = this.#editable();
    const current = toUserProfile(entity);
    for (const field of expected) {
      if (current[field.field] !== field.currentValue) {
        throw new Error("个人资料已变化，请重新解析附件后确认");
      }
    }
    const next = mergeProfile(current, changes);
    assertWritableProfileDefaults(next);
    return this.#add("import", entity.localVersion, entity.syncStatus, current, next, "enqueue");
  }

  public async prepareAcceptServer(): Promise<ProfileWriteProposal> {
    await this.initialSync();
    const entity = this.profiles.currentEntity();
    if (entity.syncStatus !== "conflict" && entity.syncStatus !== "failed") {
      throw new Error("同步问题不存在或已经解决");
    }
    const issue = this.profiles.getSyncIssue();
    const server = issue?.serverOperation === "upsert" && issue.serverPayload
      ? toUserProfile({ ...entity, entityVersion: issue.serverVersion, payload: issue.serverPayload })
      : null;
    return this.#add(
      "accept_server", entity.localVersion, entity.syncStatus,
      toUserProfile(entity), server, "accept",
    );
  }

  public async prepareReapply(changes: ProfileChangeSet): Promise<ProfileWriteProposal> {
    await this.initialSync();
    const entity = this.profiles.currentEntity();
    const issue = this.profiles.getSyncIssue();
    if (!issue || issue.serverOperation !== "upsert" || !issue.serverPayload) {
      throw new Error("最新服务端版本尚未拉取");
    }
    const server = toUserProfile({
      ...entity, entityVersion: issue.serverVersion, payload: issue.serverPayload,
    });
    const next = mergeProfile(server, changes);
    assertWritableProfileDefaults(next);
    return this.#add(
      "reapply", entity.localVersion, entity.syncStatus, server, next,
      "reapply", issue.serverVersion,
    );
  }

  public async execute(id: string): Promise<UserProfile> {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error("个人资料确认不存在或已失效");
    if (this.#executing.has(id)) throw new Error("这项确认正在执行，请稍候");
    this.#executing.add(id);
    try {
      const entity = this.profiles.currentEntity();
      if (entity.localVersion !== entry.localVersion ||
          entity.entityVersion !== entry.preparedEntityVersion) {
        throw new Error("个人资料已变化，请重新检查后再确认");
      }
      if (entry.mode === "accept") this.profiles.acceptServer();
      else if (entry.mode === "reapply") {
        this.profiles.replaceBlocked(entity, entry.next!, entry.expectedVersion!);
      } else {
        this.profiles.enqueueUpdate(entity, entry.next!);
      }
      this.#entries.delete(id);
      return this.profiles.getUserProfile();
    } finally {
      this.#executing.delete(id);
    }
  }

  #editable(): LocalEntity {
    const entity = this.profiles.currentEntity();
    if (entity.syncStatus === "conflict" || entity.syncStatus === "failed") {
      throw new Error("请先解决个人资料同步问题");
    }
    return entity;
  }

  #add(
    kind: ProfileWriteProposal["kind"],
    localVersion: number,
    syncStatus: ProfileWriteProposal["syncStatus"],
    current: UserProfile,
    next: UserProfile | null,
    mode: ProposalMode,
    expectedVersion?: number,
  ): ProfileWriteProposal {
    if (next && JSON.stringify(current) === JSON.stringify(next)) {
      throw new Error("个人资料没有需要更新的内容");
    }
    const proposal = Object.freeze({
      id: `profile-${createUuidV7()}`, kind,
      current: structuredClone(current), next: next ? structuredClone(next) : null,
      syncStatus, preparedAt: new Date().toISOString(),
    });
    const typedProposal = proposal as ProfileWriteProposal;
    this.#entries.set(typedProposal.id, {
      proposal: typedProposal, localVersion,
      preparedEntityVersion: current.entityVersion ?? localVersion,
      next: next ? structuredClone(next) : null,
      mode, ...(expectedVersion === undefined ? {} : { expectedVersion }),
    });
    return typedProposal;
  }
}

function assertWritableProfileDefaults(profile: UserProfile): void {
  if (profile.preferredLanguage !== null && !isProfileLanguage(profile.preferredLanguage)) {
    throw new Error("请先将简历默认语言改为受支持值");
  }
  if (profile.resumeStyle !== null && !isProfileResumeStyle(profile.resumeStyle)) {
    throw new Error("请先将简历默认风格改为受支持值");
  }
}
