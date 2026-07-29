import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type {
  ApplicationCreateInput,
  ApplicationDuplicateWarning,
  ApplicationRecord,
  ApplicationReferenceOption,
  ApplicationUpdateInput,
  ApplicationWriteProposal,
} from "../../../tracker/types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { ApplicationSyncStore } from "./application-sync-store.js";

type ProposalStorage = Pick<LocalSyncStore, "getEntity">;

type StoredProposal =
  | { view: ApplicationWriteProposal; create: ApplicationCreateInput }
  | {
      view: ApplicationWriteProposal;
      applicationId: string;
      expectedVersion: number;
      update: ApplicationUpdateInput;
    };

export class ApplicationProposalService {
  readonly #proposals = new Map<string, StoredProposal>();

  public constructor(
    private readonly local: ProposalStorage,
    private readonly applications: ApplicationSyncStore,
  ) {}

  public async prepareCreate(
    input: ApplicationCreateInput,
  ): Promise<ApplicationWriteProposal> {
    const jd = this.#asset("job_description", input.jdId);
    const resume = this.#asset("resume", input.resumeId);
    const hash = this.#contentHash(resume.entity);
    const duplicate = await this.#duplicate(jd.id, resume.id);
    const view = this.#view("create", input, jd, resume, hash, duplicate);
    this.#proposals.set(view.id, {
      view,
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
    if (current.jdId === input.jdId && current.resumeId === input.resumeId) {
      throw new Error("JD 与 Resume 关联没有变化");
    }
    const jd = this.#asset("job_description", input.jdId);
    const resume = this.#asset("resume", input.resumeId);
    const hash = this.#contentHash(resume.entity);
    const duplicate = await this.#duplicate(jd.id, resume.id, applicationId);
    const view = this.#view("relation_correction", input, jd, resume, hash, duplicate, current);
    this.#proposals.set(view.id, {
      view,
      applicationId,
      expectedVersion: current.entityVersion,
      update: structuredClone({
        ...input,
        resumeContentHashSnapshot: hash,
      }),
    });
    return structuredClone(view);
  }

  public async execute(proposalId: string): Promise<ApplicationRecord> {
    const proposal = this.#proposals.get(proposalId);
    if (!proposal) throw new Error("确认内容已失效，请重新检查");
    let result: ApplicationRecord;
    if ("create" in proposal) {
      result = await this.applications.createApplication(proposal.create);
    } else {
      const current = await this.applications.getApplication(proposal.applicationId);
      if (current.entityVersion !== proposal.expectedVersion) {
        throw new Error("投递记录已变化，请重新检查后再确认");
      }
      result = await this.applications.updateApplication(
        proposal.applicationId,
        proposal.update,
      );
    }
    this.#proposals.delete(proposalId);
    return result;
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

  #asset(
    type: "job_description" | "resume",
    id: string | null | undefined,
  ): ApplicationReferenceOption & { entity: LocalEntity } {
    if (!id) throw new Error(type === "resume" ? "请选择实际投递的 Resume" : "请选择投递 JD");
    const entity = this.local.getEntity(type, id);
    const title = entity?.payload.title;
    if (!entity || entity.operation === "delete" || typeof title !== "string" || !title.trim()) {
      throw new Error(`引用资产 ${id} 不存在`);
    }
    return { id, title: title.trim(), entity };
  }

  #contentHash(entity: LocalEntity): string {
    const value = entity.payload.contentHash;
    if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
      throw new Error("实际投递 Resume 缺少有效内容指纹");
    }
    return value;
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
