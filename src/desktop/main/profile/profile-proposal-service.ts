import type { UserProfile } from "../../../api/types.js";
import type { ProfileContactUpdate, ProfileImportField, ProfileWriteProposal } from "../../../profile/types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import { contactOf, mergeContact, toUserProfile } from "./profile-sync-mapping.js";
import { ProfileSyncStore } from "./profile-sync-store.js";

type Entry = { proposal: ProfileWriteProposal; localVersion: number; next: UserProfile | null; mode: "enqueue" | "accept" | "reapply"; expectedVersion?: number };

export class ProfileProposalService {
  readonly #entries = new Map<string, Entry>();
  readonly #executing = new Set<string>();
  public constructor(private readonly profiles: ProfileSyncStore, private readonly initialSync: () => Promise<void>) {}

  public async prepareUpdate(changes: ProfileContactUpdate, kind: "manual" | "import" = "manual") {
    await this.initialSync();
    const entity = this.#editable();
    const next = mergeContact(toUserProfile(entity), changes);
    return this.#add(kind, entity.localVersion, entity.syncStatus, contactOf(toUserProfile(entity)), next, "enqueue");
  }

  public async prepareImport(changes: ProfileContactUpdate, expected: readonly ProfileImportField[]) {
    await this.initialSync();
    const entity = this.#editable();
    const current = contactOf(toUserProfile(entity));
    for (const field of expected) if (current[field.field] !== field.currentValue) {
      throw new Error("个人资料已变化，请重新解析附件后确认");
    }
    const next = mergeContact(toUserProfile(entity), changes);
    return this.#add("import", entity.localVersion, entity.syncStatus, current, next, "enqueue");
  }

  public async prepareAcceptServer() {
    await this.initialSync();
    const entity = this.profiles.currentEntity();
    if (entity.syncStatus !== "conflict" && entity.syncStatus !== "failed") throw new Error("同步问题不存在或已经解决");
    return this.#add("accept_server", entity.localVersion, entity.syncStatus, contactOf(toUserProfile(entity)), null, "accept");
  }

  public async prepareReapply(changes: ProfileContactUpdate) {
    await this.initialSync();
    const entity = this.profiles.currentEntity();
    const issue = this.profiles.getSyncIssue();
    if (!issue || issue.serverOperation !== "upsert" || !issue.serverPayload) throw new Error("最新服务端版本尚未拉取");
    const server = toUserProfile({ ...entity, entityVersion: issue.serverVersion, payload: issue.serverPayload });
    const next = mergeContact(server, changes);
    return this.#add("reapply", entity.localVersion, entity.syncStatus, contactOf(server), next, "reapply", issue.serverVersion);
  }

  public async execute(id: string): Promise<UserProfile> {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error("个人资料确认不存在或已失效");
    if (this.#executing.has(id)) throw new Error("这项确认正在执行，请稍候");
    this.#executing.add(id);
    try {
      const entity = this.profiles.currentEntity();
      if (entity.localVersion !== entry.localVersion) throw new Error("个人资料已变化，请重新检查后再确认");
      if (entry.mode === "accept") this.profiles.acceptServer();
      else if (entry.mode === "reapply") this.profiles.replaceBlocked(entity, entry.next!, entry.expectedVersion!);
      else this.profiles.enqueueUpdate(entity, entry.next!);
      this.#entries.delete(id);
      return this.profiles.getUserProfile();
    } finally { this.#executing.delete(id); }
  }

  #editable() {
    const entity = this.profiles.currentEntity();
    if (entity.syncStatus === "conflict" || entity.syncStatus === "failed") throw new Error("请先解决个人资料同步问题");
    return entity;
  }

  #add(kind: ProfileWriteProposal["kind"], localVersion: number, syncStatus: ProfileWriteProposal["syncStatus"], current: ProfileWriteProposal["current"], next: UserProfile | null, mode: Entry["mode"], expectedVersion?: number) {
    const proposal = Object.freeze({ id: `profile-${createUuidV7()}`,
      kind, current: Object.freeze(structuredClone(current)), next: next ? Object.freeze(contactOf(next)) : null, syncStatus, preparedAt: new Date().toISOString() });
    this.#entries.set(proposal.id, { proposal, localVersion, next: next ? structuredClone(next) : null, mode,
      ...(expectedVersion === undefined ? {} : { expectedVersion }) });
    return proposal;
  }
}
