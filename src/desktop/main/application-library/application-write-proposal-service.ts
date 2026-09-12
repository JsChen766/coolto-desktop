import type {
  ApplicationCreateInput,
  ApplicationRecord,
  ApplicationReferenceOption,
  ApplicationTransitionInput,
  ApplicationUpdateInput,
  ApplicationWriteProposal,
} from "../../../tracker/types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { ApplicationSyncStore } from "./application-sync-store.js";

export type ApplicationProposalHandle = { id: string };
type ApplicationStorage = Pick<LocalSyncStore, "getEntity">;
type ApplicationAssetVersions = { jd: number; resume: number };

export type ApplicationAssetSnapshots = {
  jd: { id: string; title: string; localVersion: number };
  resume: { id: string; title: string; localVersion: number; contentHash: string };
};

export type StoredApplicationProposal =
  | { view: ApplicationWriteProposal; create: ApplicationCreateInput; assetVersions: ApplicationAssetVersions }
  | {
      view: ApplicationWriteProposal;
      applicationId: string;
      expectedVersion: number;
      expectedLocalVersion: number;
      update: ApplicationUpdateInput;
      assetVersions: ApplicationAssetVersions;
    }
  | {
      view: ApplicationProposalHandle;
      applicationId: string;
      expectedVersion: number;
      expectedLocalVersion: number;
      transition: ApplicationTransitionInput;
      assetSnapshots: ApplicationAssetSnapshots;
    }
  | {
      view: ApplicationProposalHandle;
      applicationId: string;
      expectedVersion: number;
      expectedLocalVersion: number;
      delete: true;
      assetSnapshots: ApplicationAssetSnapshots;
    };

export function applicationAsset(
  storage: ApplicationStorage,
  type: "job_description" | "resume",
  id: string | null | undefined,
): ApplicationReferenceOption & { entity: LocalEntity } {
  if (!id) throw new Error(type === "resume" ? "请选择实际投递的 Resume" : "请选择投递 JD");
  const entity = storage.getEntity(type, id);
  const title = entity?.payload.title;
  if (!entity || entity.operation === "delete" || typeof title !== "string" || !title.trim()) {
    throw new Error(`引用资产 ${id} 不存在`);
  }
  return { id, title: title.trim(), entity };
}

export function applicationContentHash(entity: LocalEntity): string {
  const value = entity.payload.contentHash;
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("实际投递 Resume 缺少有效内容指纹");
  }
  return value;
}

export function captureApplicationAssetSnapshots(
  storage: ApplicationStorage,
  application: Pick<ApplicationRecord, "jdId" | "resumeId">,
): ApplicationAssetSnapshots {
  const jd = applicationAsset(storage, "job_description", application.jdId);
  const resume = applicationAsset(storage, "resume", application.resumeId);
  return {
    jd: { id: jd.id, title: jd.title, localVersion: jd.entity.localVersion },
    resume: {
      id: resume.id,
      title: resume.title,
      localVersion: resume.entity.localVersion,
      contentHash: applicationContentHash(resume.entity),
    },
  };
}

export function assertApplicationAssetSnapshots(
  storage: ApplicationStorage,
  application: Pick<ApplicationRecord, "jdId" | "resumeId">,
  frozen: ApplicationAssetSnapshots,
): void {
  try {
    const current = captureApplicationAssetSnapshots(storage, application);
    if (
      current.jd.id !== frozen.jd.id ||
      current.jd.title !== frozen.jd.title ||
      current.jd.localVersion !== frozen.jd.localVersion ||
      current.resume.id !== frozen.resume.id ||
      current.resume.title !== frozen.resume.title ||
      current.resume.localVersion !== frozen.resume.localVersion ||
      current.resume.contentHash !== frozen.resume.contentHash
    ) {
      throw new Error("投递 JD 或 Resume 已变化，请重新检查后再确认");
    }
  } catch {
    throw new Error("投递 JD 或 Resume 已变化，请重新检查后再确认");
  }
}

export function applicationVersion(
  storage: ApplicationStorage,
  applicationId: string,
): Pick<LocalEntity, "entityVersion" | "localVersion"> {
  const entity = storage.getEntity("application", applicationId);
  if (!entity || entity.operation === "delete") throw new Error("Application 不存在");
  return entity;
}

export function assertApplicationVersion(
  storage: ApplicationStorage,
  applicationId: string,
  expectedVersion: number,
  expectedLocalVersion: number,
): void {
  const current = applicationVersion(storage, applicationId);
  if (
    current.entityVersion !== expectedVersion ||
    current.localVersion !== expectedLocalVersion
  ) {
    throw new Error("投递记录已变化，请重新检查后再确认");
  }
}

export function assertCreateProposalAssets(
  storage: ApplicationStorage,
  proposal: Extract<StoredApplicationProposal, { create: ApplicationCreateInput }>,
): void {
  const jd = applicationAsset(storage, "job_description", proposal.create.jdId);
  const resume = applicationAsset(storage, "resume", proposal.create.resumeId);
  if (
    jd.entity.localVersion !== proposal.assetVersions.jd ||
    resume.entity.localVersion !== proposal.assetVersions.resume ||
    jd.title !== proposal.view.jd.title ||
    resume.title !== proposal.view.resume.title ||
    applicationContentHash(resume.entity) !== proposal.view.resumeContentHashSnapshot
  ) {
    throw new Error("投递 JD 或 Resume 已变化，请重新检查后再确认");
  }
}

export function assertUpdateProposalAssets(
  storage: ApplicationStorage,
  proposal: Extract<StoredApplicationProposal, { update: ApplicationUpdateInput }>,
): void {
  const jd = applicationAsset(storage, "job_description", proposal.update.jdId);
  const resume = applicationAsset(storage, "resume", proposal.update.resumeId);
  if (
    jd.entity.localVersion !== proposal.assetVersions.jd ||
    resume.entity.localVersion !== proposal.assetVersions.resume ||
    jd.title !== proposal.view.jd.title ||
    resume.title !== proposal.view.resume.title ||
    applicationContentHash(resume.entity) !== proposal.view.resumeContentHashSnapshot
  ) {
    throw new Error("投递 JD 或 Resume 已变化，请重新检查后再确认");
  }
}
/** Finds one durable Application for a frozen submission intent. */
export async function findExistingApplicationBySubmissionKey(
  applications: Pick<ApplicationSyncStore, "listApplications">,
  input: {
    dedupeKey: string;
    jdId: string;
    resumeId: string;
    resumeContentHash: string;
  },
): Promise<ApplicationRecord | undefined> {
  const values = [
    input.dedupeKey,
    input.jdId,
    input.resumeId,
    input.resumeContentHash,
  ];
  if (values.some((value) =>
    typeof value !== "string" || !value || value.trim() !== value
  )) {
    throw new Error("投递恢复键参数无效：字段必须为非空且不得包含首尾空格");
  }
  const key = input.dedupeKey;
  let cursor: string | undefined;
  const candidates: ApplicationRecord[] = [];
  while (true) {
    const page = await applications.listApplications(
      cursor ? { limit: 500, cursor } : { limit: 500 },
    );
    candidates.push(...page.items.filter((item) => item.dedupeKey === key));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  if (candidates.length === 0) return undefined;
  if (candidates.length > 1) {
    throw new Error("投递恢复键匹配到多条 Application");
  }
  const candidate = candidates[0];
  if (!candidate) return undefined;
  if (
    candidate.jdId !== input.jdId ||
    candidate.resumeId !== input.resumeId ||
    candidate.resumeContentHashSnapshot !== input.resumeContentHash
  ) {
    throw new Error("投递恢复键不匹配，请重新读取并确认");
  }
  return candidate;
}
