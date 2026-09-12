import { createUuidV7 } from "../../../sync/uuid-v7.js";
import { canTransitionApplication } from "../../../tracker/application-status.js";
import {
  applicationAsset,
  applicationContentHash,
  applicationVersion,
  assertApplicationAssetSnapshots,
  assertApplicationVersion,
  assertCreateProposalAssets,
  assertUpdateProposalAssets,
  captureApplicationAssetSnapshots,
  findExistingApplicationBySubmissionKey,
  type ApplicationProposalHandle,
  type StoredApplicationProposal,
} from "./application-write-proposal-service.js";
import type {
  ApplicationCreateInput,
  ApplicationDuplicateWarning,
  ApplicationRecord,
  ApplicationReferenceOption,
  ApplicationTombstone,
  ApplicationTransitionInput,
  ApplicationUpdateInput,
  ApplicationWriteProposal,
} from "../../../tracker/types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type { ApplicationSyncStore } from "./application-sync-store.js";

type ProposalStorage = Pick<LocalSyncStore, "getEntity">;

export class ApplicationProposalService {
  readonly #proposals = new Map<string, StoredApplicationProposal>();
  readonly #executing = new Set<string>();

  public constructor(
    private readonly local: ProposalStorage,
    private readonly applications: ApplicationSyncStore,
  ) {}

  public async prepareCreate(
    input: ApplicationCreateInput,
  ): Promise<ApplicationWriteProposal> {
    await this.applications.listReferenceOptions();
    const jd = applicationAsset(this.local, "job_description", input.jdId);
    const resume = applicationAsset(this.local, "resume", input.resumeId);
    const hash = applicationContentHash(resume.entity);
    const duplicate = await this.#duplicate(jd.id, resume.id);
    const view = this.#view("create", input, jd, resume, hash, duplicate);
    this.#proposals.set(view.id, {
      view,
      assetVersions: {
        jd: jd.entity.localVersion,
        resume: resume.entity.localVersion,
      },
      create: structuredClone({
        ...input,
        jdId: jd.id,
        resumeId: resume.id,
        jdTitleSnapshot: jd.title,
        resumeTitleSnapshot: resume.title,
        resumeContentHashSnapshot: hash,
        idempotencyKey: view.id,
      }),
    });
    return structuredClone(view);
  }

  public async prepareUpdate(
    applicationId: string,
    input: ApplicationUpdateInput,
  ): Promise<ApplicationWriteProposal> {
    const current = await this.applications.getApplication(applicationId);
    const currentEntity = applicationVersion(this.local, applicationId);
    const jd = applicationAsset(this.local, "job_description", input.jdId);
    const resume = applicationAsset(this.local, "resume", input.resumeId);
    const hash = applicationContentHash(resume.entity);
    const duplicate = await this.#duplicate(jd.id, resume.id, applicationId);
    const view = this.#view(
      "relation_correction", input, jd, resume, hash, duplicate, current,
    );
    this.#proposals.set(view.id, {
      view,
      applicationId,
      expectedVersion: current.entityVersion,
      expectedLocalVersion: currentEntity.localVersion,
      update: structuredClone({
        ...input,
        resumeContentHashSnapshot: hash,
      }),
      assetVersions: {
        jd: jd.entity.localVersion,
        resume: resume.entity.localVersion,
      },
    });
    return structuredClone(view);
  }

  public async prepareTransition(
    applicationId: string,
    input: ApplicationTransitionInput,
  ): Promise<ApplicationProposalHandle> {
    const current = await this.applications.getApplication(applicationId);
    if (!canTransitionApplication(current.status, input.toStatus)) {
      throw new Error(`非法投递状态迁移：${current.status} → ${input.toStatus}`);
    }
    const view = { id: createUuidV7() };
    this.#proposals.set(view.id, {
      view,
      applicationId,
      expectedVersion: current.entityVersion,
      expectedLocalVersion: applicationVersion(this.local, applicationId).localVersion,
      transition: structuredClone(input),
      assetSnapshots: captureApplicationAssetSnapshots(this.local, current),
    });
    return structuredClone(view);
  }

  public async prepareDelete(applicationId: string): Promise<ApplicationProposalHandle> {
    const current = await this.applications.getApplication(applicationId);
    const view = { id: createUuidV7() };
    this.#proposals.set(view.id, {
      view,
      applicationId,
      expectedVersion: current.entityVersion,
      expectedLocalVersion: applicationVersion(this.local, applicationId).localVersion,
      delete: true,
      assetSnapshots: captureApplicationAssetSnapshots(this.local, current),
    });
    return structuredClone(view);
  }

  /** Receipt recovery uses the frozen intent key and Resume hash after restart. */
  public findExistingBySubmissionKey(input: {
    dedupeKey: string;
    jdId: string;
    resumeId: string;
    resumeContentHash: string;
  }): Promise<ApplicationRecord | undefined> {
    return findExistingApplicationBySubmissionKey(this.applications, input);
  }
  public async execute(
    proposalId: string,
  ): Promise<ApplicationRecord | ApplicationTombstone> {
    const proposal = this.#proposals.get(proposalId);
    if (!proposal) throw new Error("确认内容已失效，请重新检查");
    if (this.#executing.has(proposalId)) {
      throw new Error("这项确认正在执行，请稍候");
    }
    this.#executing.add(proposalId);
    try {
      let result: ApplicationRecord | ApplicationTombstone;
      if ("create" in proposal) {
        assertCreateProposalAssets(this.local, proposal);
        result = await this.applications.createApplication({
          ...proposal.create,
          idempotencyKey: proposal.view.id,
        });
      } else {
        const current = await this.applications.getApplication(proposal.applicationId);
        assertApplicationVersion(
          this.local,
          proposal.applicationId,
          proposal.expectedVersion,
          proposal.expectedLocalVersion,
        );
        if ("transition" in proposal || "delete" in proposal) {
          assertApplicationAssetSnapshots(this.local, current, proposal.assetSnapshots);
        }
        if ("update" in proposal) {
          assertUpdateProposalAssets(this.local, proposal);
          result = await this.applications.updateApplication(
            proposal.applicationId,
            proposal.update,
            proposal.view.id,
          );
        } else if ("transition" in proposal) {
          if (!canTransitionApplication(current.status, proposal.transition.toStatus)) {
            throw new Error(`非法投递状态迁移：${current.status} → ${proposal.transition.toStatus}`);
          }
          result = await this.applications.transitionApplication(
            proposal.applicationId,
            proposal.transition,
            proposal.view.id,
          );
        } else {
          result = await this.applications.deleteApplication(
            proposal.applicationId,
            proposal.view.id,
          );
        }
      }
      this.#proposals.delete(proposalId);
      return result;
    } finally {
      this.#executing.delete(proposalId);
    }
  }

  async #duplicate(
    jdId: string,
    resumeId: string,
    excludeId?: string,
  ): Promise<ApplicationDuplicateWarning | null> {
    const page = await this.applications.listApplications({ jdId, resumeId, limit: 500 });
    const matches = page.items.filter((item) => item.id !== excludeId);
    const latest = [...matches].sort((left, right) =>
      applicationTime(right).localeCompare(applicationTime(left)),
    )[0];
    return latest
      ? { count: matches.length, latestStatus: latest.status, latestAppliedAt: latest.appliedAt }
      : null;
  }


  #view(
    kind: ApplicationWriteProposal["kind"],
    input: Pick<ApplicationCreateInput, "companyName" | "roleName">,
    jd: ApplicationReferenceOption,
    resume: ApplicationReferenceOption,
    hash: string,
    duplicate: ApplicationDuplicateWarning | null,
    current?: ApplicationRecord,
  ): ApplicationWriteProposal {
    return {
      id: createUuidV7(),
      kind,
      applicationId: current?.id ?? null,
      companyName: input.companyName.trim(),
      roleName: input.roleName.trim(),
      jd: { id: jd.id, title: jd.title },
      resume: { id: resume.id, title: resume.title },
      previousJd: current?.jdId
        ? { id: current.jdId, title: current.jdTitleSnapshot ?? "引用资产已缺失" }
        : null,
      previousResume: current?.resumeId
        ? { id: current.resumeId, title: current.resumeTitleSnapshot ?? "引用资产已缺失" }
        : null,
      resumeContentHashSnapshot: hash,
      duplicate,
      preparedAt: new Date().toISOString(),
    };
  }
}

function applicationTime(value: ApplicationRecord): string {
  return value.appliedAt ?? value.createdAt;
}
