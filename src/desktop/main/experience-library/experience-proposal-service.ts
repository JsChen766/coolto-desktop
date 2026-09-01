import type {
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceUpdateInput,
} from "../../../api/types.js";
import type {
  ExperienceProposalKind,
  ExperienceSyncIssueView,
  ExperienceWriteProposal,
} from "../../../experience/maintenance-types.js";
import { validateExperienceSnapshot } from "../../../experience/validation.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { LocalEntity, SyncIssue } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type { ExperienceExecution } from "./experience-mutation-executor.js";
import { ExperienceMutationExecutor } from "./experience-mutation-executor.js";
import { buildExperienceCreateProposal } from "./experience-create-proposal.js";
import {
  buildLocalExperience,
  toExperienceDetail,
  toExperienceWritePayload,
} from "./experience-sync-mapping.js";
import {
  buildExperienceDelete,
  buildExperienceUpdate,
} from "./experience-write-mapping.js";
import {
  changesFrom,
  createInput,
  issueView,
  proposalSnapshot as snapshot,
  serverLocalEntity,
  updateMutation,
} from "./experience-proposal-mapping.js";
import { ExperienceProposalRegistry } from "./experience-proposal-registry.js";

export class ExperienceProposalService {
  readonly #registry: ExperienceProposalRegistry;

  public constructor(
    private readonly local: LocalSyncStore,
    executor: ExperienceMutationExecutor,
    private readonly initialSync: () => Promise<void>,
  ) {
    this.#registry = new ExperienceProposalRegistry(local, executor);
  }

  public async prepareCreate(
    input: ExperienceCreateInput,
  ): Promise<ExperienceWriteProposal> {
    await this.initialSync();
    const draft = buildExperienceCreateProposal(input);
    return this.#registry.addCreate(
      draft.experienceId,
      draft.next,
      draft.execution,
    );
  }

  public async prepareUpdate(
    experienceId: string,
    changes: ExperienceUpdateInput,
    kind: ExperienceProposalKind = "update",
  ): Promise<ExperienceWriteProposal> {
    await this.initialSync();
    const entity = this.#editable(experienceId);
    const current = toExperienceDetail(entity);
    const now = new Date().toISOString();
    const mapped = buildExperienceUpdate(
      entity, current, changes, createUuidV7(), now,
    );
    const next = toExperienceDetail({ ...entity, payload: mapped.localPayload });
    validateExperienceSnapshot(snapshot(next));
    return this.#registry.add(kind, entity, snapshot(current), snapshot(next), {
      mode: "enqueue",
      mutation: {
        operationId: createUuidV7(), entityType: "experience",
        entityId: entity.entityId, action: "update",
        expectedVersion: entity.entityVersion, payload: mapped.writePayload,
        localPayload: mapped.localPayload, createdAt: now,
      },
    });
  }

  public async prepareArchive(experienceId: string): Promise<ExperienceWriteProposal> {
    const current = await this.#current(experienceId);
    if (current.status === "archived") throw new Error("经历已经归档");
    return this.prepareUpdate(experienceId, { status: "archived" }, "archive");
  }

  public async prepareRestore(experienceId: string): Promise<ExperienceWriteProposal> {
    const current = await this.#current(experienceId);
    if (current.status === "active") throw new Error("经历已经是启用状态");
    return this.prepareUpdate(experienceId, { status: "active" }, "restore");
  }

  public async prepareDelete(experienceId: string): Promise<ExperienceWriteProposal> {
    await this.initialSync();
    const entity = this.#editable(experienceId);
    const now = new Date().toISOString();
    const mapped = buildExperienceDelete(entity, now);
    return this.#registry.add("delete", entity, snapshot(toExperienceDetail(entity)), null, {
      mode: "enqueue",
      mutation: {
        operationId: createUuidV7(), entityType: "experience",
        entityId: entity.entityId, action: "delete",
        expectedVersion: entity.entityVersion, payload: mapped.writePayload,
        localPayload: mapped.localPayload, createdAt: now,
      },
    });
  }

  public async getSyncIssue(experienceId: string): Promise<ExperienceSyncIssueView> {
    await this.initialSync();
    const issue = this.#issue(experienceId);
    return issueView(issue, this.#requiredEntity(issue.entityId));
  }

  public async prepareAcceptServer(
    experienceId: string,
  ): Promise<ExperienceWriteProposal> {
    await this.initialSync();
    const issue = this.#issue(experienceId);
    const view = issueView(issue, this.#requiredEntity(issue.entityId));
    const entity = this.#requiredEntity(experienceId);
    return this.#registry.add(
      "accept_server",
      entity,
      snapshot(view.local),
      view.server ? snapshot(view.server) : null,
      { mode: "accept_server", experienceId },
      issue.errorCode,
    );
  }

  public async prepareReapply(experienceId: string): Promise<ExperienceWriteProposal> {
    await this.initialSync();
    const issue = this.#issue(experienceId);
    const entity = this.#requiredEntity(experienceId);
    const localDetail = toExperienceDetail(entity);
    const now = new Date().toISOString();
    let execution: ExperienceExecution;
    let next: ExperienceDetail;
    if (issue.serverOperation === "delete") {
      throw new Error("服务端经历已删除，只能接受删除或另存为新经历");
    } else if (issue.serverOperation === "upsert" && issue.serverPayload) {
      const serverEntity = serverLocalEntity(issue);
      const server = toExperienceDetail(serverEntity);
      const mapped = buildExperienceUpdate(
        serverEntity, server, changesFrom(localDetail), createUuidV7(), now,
      );
      next = toExperienceDetail({ ...serverEntity, payload: mapped.localPayload });
      execution = { mode: "replace_blocked", mutation: updateMutation(
        experienceId, issue.serverVersion, mapped, now,
      ) };
    } else if (issue.action === "create") {
      const input = createInput(localDetail);
      const revisionId = localDetail.currentRevisionId ?? createUuidV7();
      next = localDetail;
      execution = { mode: "replace_blocked", mutation: {
        operationId: createUuidV7(), entityType: "experience", entityId: experienceId,
        action: "create", expectedVersion: null,
        payload: toExperienceWritePayload(input, revisionId),
        localPayload: { ...issue.localPayload, updatedAt: now }, createdAt: now,
      } };
    } else {
      throw new Error("最新服务端版本尚未拉取");
    }
    validateExperienceSnapshot(snapshot(next));
    return this.#registry.add(
      "reapply", entity, snapshot(localDetail), snapshot(next),
      execution, issue.errorCode,
    );
  }

  public async prepareSaveAsNew(
    experienceId: string,
  ): Promise<ExperienceWriteProposal> {
    await this.initialSync();
    const issue = this.#issue(experienceId);
    const entity = this.#requiredEntity(experienceId);
    const current = toExperienceDetail(entity);
    const input = createInput(current);
    const id = createUuidV7();
    const revisionId = createUuidV7();
    const now = new Date().toISOString();
    const localPayload = buildLocalExperience(id, revisionId, input, now);
    const nextEntity = { ...entity, entityId: id, entityVersion: 0, localVersion: 1,
      syncStatus: "pending" as const, operation: "upsert" as const, payload: localPayload };
    const next = toExperienceDetail(nextEntity);
    validateExperienceSnapshot(snapshot(next));
    return this.#registry.add("save_as_new", entity, snapshot(current), snapshot(next), {
      mode: "save_as_new",
      sourceExperienceId: experienceId,
      mutation: {
        operationId: createUuidV7(), entityType: "experience", entityId: id,
        action: "create", expectedVersion: null,
        payload: toExperienceWritePayload(input, revisionId), localPayload, createdAt: now,
      },
    }, issue.errorCode);
  }

  public execute(proposalId: string) {
    return this.#registry.execute(proposalId);
  }

  public executeMany(proposalIds: readonly string[]) {
    return this.#registry.executeMany(proposalIds);
  }

  public discard(proposalId: string): void {
    this.#registry.discard(proposalId);
  }

  async #current(id: string): Promise<ExperienceDetail> {
    await this.initialSync();
    return toExperienceDetail(this.#requiredEntity(id));
  }

  #editable(id: string): LocalEntity {
    const entity = this.#requiredEntity(id);
    if (entity.operation === "delete") throw new Error("已删除经历不能修改");
    if (entity.syncStatus === "conflict" || entity.syncStatus === "failed") {
      throw new Error("请先解决经历同步问题");
    }
    return entity;
  }

  #requiredEntity(id: string): LocalEntity {
    const normalized = id.trim();
    if (!normalized) throw new Error("experienceId 不能为空");
    const entity = this.local.getEntity("experience", normalized);
    if (!entity) throw new Error(`经历 ${normalized} 不存在`);
    return entity;
  }

  #issue(id: string): SyncIssue {
    const issue = this.local.getSyncIssue("experience", id);
    if (!issue) throw new Error("同步问题不存在或已经解决");
    return issue;
  }
}
