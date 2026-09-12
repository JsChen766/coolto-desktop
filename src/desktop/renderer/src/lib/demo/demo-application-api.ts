import type {
  ApplicationCreateInput,
  ApplicationRecord,
  ApplicationTombstone,
  ApplicationTransitionInput,
  ApplicationUpdateInput,
  DesktopApi,
} from "../../../../shared/types.js";
export const DEMO_APPLICATION_REFERENCES = {
  jds: [
    { id: "jd-001", title: "高级前端工程师 · 星河科技" },
    { id: "jd-002", title: "AI 产品经理 · 云端智能" },
  ],
  resumes: [
    { id: "resume-001", title: "高级前端工程师简历" },
    { id: "resume-002", title: "AI 产品经理简历" },
  ],
};
type DemoProposal = { kind: "create"; input: ApplicationCreateInput }
  | { kind: "update"; applicationId: string; changes: ApplicationUpdateInput }
  | { kind: "transition"; applicationId: string; transition: ApplicationTransitionInput }
  | { kind: "delete"; applicationId: string };
export function createDemoApplicationApi(now: Date): DesktopApi["applications"] {
  let applications = createDemoApplications(now);
  const proposals = new Map<string, DemoProposal>();
  const find = (id: string): ApplicationRecord => {
    const application = applications.find((item) => item.id === id);
    if (!application) throw new Error("Demo Application 不存在");
    return application;
  };
  const applyCreate = (input: ApplicationCreateInput): ApplicationRecord => {
    const { idempotencyKey: _idempotencyKey, ...fields } = input;
    const timestamp = new Date().toISOString();
    const jd = DEMO_APPLICATION_REFERENCES.jds.find((item) => item.id === input.jdId);
    const resume = DEMO_APPLICATION_REFERENCES.resumes.find((item) => item.id === input.resumeId);
    const created: ApplicationRecord = {
      ...createDemoApplications(now)[0]!, ...fields,
      id: crypto.randomUUID(), jdId: input.jdId ?? null, resumeId: input.resumeId ?? null,
      jdTitleSnapshot: input.jdTitleSnapshot ?? jd?.title ?? null,
      resumeTitleSnapshot: input.resumeTitleSnapshot ?? resume?.title ?? null,
      resumeContentHashSnapshot: input.resumeContentHashSnapshot ?? "a".repeat(64),
      status: "applied", targetUrl: input.targetUrl ?? null, appliedAt: input.appliedAt ?? null,
      pendingConfirmation: input.pendingConfirmation ?? false, source: input.source ?? "manual",
      dedupeKey: input.dedupeKey ?? null, companyBusiness: input.companyBusiness ?? null,
      roleSummary: input.roleSummary ?? null, companyCulture: input.companyCulture ?? null,
      rejectionReason: null, entityVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      deletedAt: null, syncStatus: "clean",
    };
    applications = [created, ...applications];
    return structuredClone(created);
  };
  const api: DesktopApi["applications"] = {
    list: async (options) => {
      const query = options?.query?.trim().toLocaleLowerCase();
      const items = applications.filter((item) =>
        (!options?.status || item.status === options.status) &&
        (!options?.jdId || item.jdId === options.jdId) &&
        (!options?.resumeId || item.resumeId === options.resumeId) &&
        (!query || `${item.companyName} ${item.roleName}`.toLocaleLowerCase().includes(query)),
      );
      return { items: structuredClone(items), nextCursor: null };
    },
    references: async () => structuredClone(DEMO_APPLICATION_REFERENCES),
    get: async (id) => structuredClone(find(id)),
    prepareCreate: async (input) => {
      const jd = DEMO_APPLICATION_REFERENCES.jds.find((item) => item.id === input.jdId);
      const resume = DEMO_APPLICATION_REFERENCES.resumes.find((item) => item.id === input.resumeId);
      if (!jd || !resume) throw new Error("请选择 JD 与实际投递 Resume");
      const id = crypto.randomUUID();
      proposals.set(id, { kind: "create", input: structuredClone(input) });
      const matches = applications.filter((item) => item.jdId === jd.id && item.resumeId === resume.id);
      return {
        id, kind: "create", applicationId: null, companyName: input.companyName,
        roleName: input.roleName, jd, resume, previousJd: null, previousResume: null,
        resumeContentHashSnapshot: "a".repeat(64),
        duplicate: matches[0] ? {
          count: matches.length, latestStatus: matches[0].status, latestAppliedAt: matches[0].appliedAt,
        } : null,
        preparedAt: new Date().toISOString(),
      };
    },
    prepareUpdate: async ({ applicationId, changes }) => {
      const current = find(applicationId);
      const jd = DEMO_APPLICATION_REFERENCES.jds.find((item) => item.id === changes.jdId);
      const resume = DEMO_APPLICATION_REFERENCES.resumes.find((item) => item.id === changes.resumeId);
      if (!jd || !resume) throw new Error("请选择 JD 与实际投递 Resume");
      const id = crypto.randomUUID();
      proposals.set(id, { kind: "update", applicationId, changes: structuredClone(changes) });
      return {
        id, kind: "relation_correction", applicationId, companyName: changes.companyName,
        roleName: changes.roleName, jd, resume,
        previousJd: current.jdId ? { id: current.jdId, title: current.jdTitleSnapshot ?? "引用资产已缺失" } : null,
        previousResume: current.resumeId ? { id: current.resumeId, title: current.resumeTitleSnapshot ?? "引用资产已缺失" } : null,
        resumeContentHashSnapshot: "b".repeat(64), duplicate: null, preparedAt: new Date().toISOString(),
      };
    },
    prepareTransition: async ({ applicationId, transition }) => {
      find(applicationId);
      const id = crypto.randomUUID();
      proposals.set(id, { kind: "transition", applicationId, transition: structuredClone(transition) });
      return { id };
    },
    prepareDelete: async (applicationId) => {
      find(applicationId);
      const id = crypto.randomUUID();
      proposals.set(id, { kind: "delete", applicationId });
      return { id };
    },
    executeProposal: async (proposalId) => {
      const proposal = proposals.get(proposalId);
      if (!proposal) throw new Error("确认内容已失效");
      let result: ApplicationRecord | ApplicationTombstone;
      if (proposal.kind === "create") result = applyCreate(proposal.input);
      else if (proposal.kind === "update") {
        const current = find(proposal.applicationId);
        const next: ApplicationRecord = {
          ...current, ...proposal.changes, entityVersion: current.entityVersion + 1,
          updatedAt: new Date().toISOString(),
        };
        applications = applications.map((item) => item.id === proposal.applicationId ? next : item);
        result = structuredClone(next);
      } else if (proposal.kind === "transition") {
        const current = find(proposal.applicationId);
        const next: ApplicationRecord = {
          ...current, status: proposal.transition.toStatus,
          rejectionReason: proposal.transition.toStatus === "rejected"
            ? proposal.transition.reason ?? current.rejectionReason : current.rejectionReason,
          entityVersion: current.entityVersion + 1,
          updatedAt: proposal.transition.occurredAt ?? new Date().toISOString(),
        };
        applications = applications.map((item) => item.id === proposal.applicationId ? next : item);
        result = structuredClone(next);
      } else {
        const current = find(proposal.applicationId);
        applications = applications.filter((item) => item.id !== proposal.applicationId);
        result = { id: current.id, entityVersion: current.entityVersion + 1,
          deletedAt: new Date().toISOString(), syncStatus: "clean" };
      }
      proposals.delete(proposalId);
      return result;
    },
  };
  return api;
}
export function createDemoApplications(now: Date): ApplicationRecord[] {
  const sample = (daysAgo: number, value: Pick<ApplicationRecord, "companyName" | "roleName" | "status"> & {
    jdId: string; resumeId: string; jdTitle: string; resumeTitle: string;
  }): ApplicationRecord => {
    const timestamp = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
    return {
      id: crypto.randomUUID(), jdId: value.jdId, resumeId: value.resumeId,
      companyName: value.companyName, roleName: value.roleName,
      jdTitleSnapshot: value.jdTitle, resumeTitleSnapshot: value.resumeTitle,
      resumeContentHashSnapshot: "a".repeat(64), deliveryMethod: "form_fill",
      targetUrl: "https://example.com/jobs/frontend", appliedAt: timestamp, status: value.status,
      pendingConfirmation: false, source: "manual", dedupeKey: null,
      companyBusiness: "企业级协作软件", roleSummary: "负责前端架构和设计系统建设",
      companyCulture: "强调用户价值与工程质量",
      rejectionReason: value.status === "rejected" ? "岗位方向调整" : null,
      entityVersion: 1, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, syncStatus: "clean",
    };
  };
  return [
    sample(1, demoApplication("星河科技", "高级前端工程师", "applied", "jd-001", "resume-001")),
    sample(3, demoApplication("云端智能", "AI 产品经理", "screening", "jd-002", "resume-001")),
    sample(6, demoApplication("远山网络", "前端技术负责人", "interviewing", "jd-001", "resume-002")),
    sample(12, demoApplication("木棉数据", "产品工程师", "offer", "jd-001", "resume-001")),
    sample(18, demoApplication("海岸实验室", "Web 工程师", "rejected", "jd-002", "resume-002")),
  ];
}
function demoApplication(companyName: string, roleName: string, status: ApplicationRecord["status"], jdId: string, resumeId: string) {
  return {
    companyName, roleName, status, jdId, resumeId,
    jdTitle: jdId === "jd-001" ? "高级前端工程师 · 星河科技" : "AI 产品经理 · 云端智能",
    resumeTitle: resumeId === "resume-001" ? "高级前端工程师简历" : "AI 产品经理简历",
  };
}
