import type { ApplicationRecord, DesktopApi } from "@desktop/types";

const references = {
  jds: [
    { id: "jd-001", title: "高级前端工程师 · 星河科技" },
    { id: "jd-002", title: "AI 产品经理 · 云端智能" },
  ],
  resumes: [
    { id: "resume-001", title: "高级前端工程师简历" },
    { id: "resume-002", title: "AI 产品经理简历" },
  ],
};

export function createDemoApplicationApi(now: Date): DesktopApi["applications"] {
  let applications = createDemoApplications(now);
  const find = (id: string): ApplicationRecord => {
    const application = applications.find((item) => item.id === id);
    if (!application) throw new Error("Demo Application 不存在");
    return application;
  };
  return {
    list: async (options) => {
      const query = options?.query?.trim().toLocaleLowerCase();
      const items = applications.filter((item) =>
        (!options?.status || item.status === options.status) &&
        (!query || `${item.companyName} ${item.roleName}`.toLocaleLowerCase().includes(query)),
      );
      return { items: structuredClone(items), nextCursor: null };
    },
    references: async () => structuredClone(references),
    get: async (id) => structuredClone(find(id)),
    create: async (input) => {
      const timestamp = new Date().toISOString();
      const jd = references.jds.find((item) => item.id === input.jdId);
      const resume = references.resumes.find((item) => item.id === input.resumeId);
      const created: ApplicationRecord = {
        id: crypto.randomUUID(),
        jdId: input.jdId ?? null,
        resumeId: input.resumeId ?? null,
        companyName: input.companyName,
        roleName: input.roleName,
        jdTitleSnapshot: input.jdTitleSnapshot ?? jd?.title ?? null,
        resumeTitleSnapshot: input.resumeTitleSnapshot ?? resume?.title ?? null,
        deliveryMethod: input.deliveryMethod,
        targetUrl: input.targetUrl ?? null,
        appliedAt: input.appliedAt ?? null,
        status: "applied",
        pendingConfirmation: input.pendingConfirmation ?? false,
        source: input.source ?? "manual",
        dedupeKey: input.dedupeKey ?? null,
        companyBusiness: input.companyBusiness ?? null,
        roleSummary: input.roleSummary ?? null,
        companyCulture: input.companyCulture ?? null,
        rejectionReason: null,
        entityVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        syncStatus: "clean",
      };
      applications = [created, ...applications];
      return structuredClone(created);
    },
    update: async ({ applicationId, changes }) => {
      const current = find(applicationId);
      const next = {
        ...current,
        ...changes,
        entityVersion: current.entityVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      applications = applications.map((item) => item.id === applicationId ? next : item);
      return structuredClone(next);
    },
    transition: async ({ applicationId, transition }) => {
      const current = find(applicationId);
      const next: ApplicationRecord = {
        ...current,
        status: transition.toStatus,
        rejectionReason: transition.toStatus === "rejected"
          ? transition.reason ?? current.rejectionReason
          : current.rejectionReason,
        entityVersion: current.entityVersion + 1,
        updatedAt: transition.occurredAt ?? new Date().toISOString(),
      };
      applications = applications.map((item) => item.id === applicationId ? next : item);
      return structuredClone(next);
    },
    delete: async (applicationId) => {
      const current = find(applicationId);
      const deletedAt = new Date().toISOString();
      applications = applications.filter((item) => item.id !== applicationId);
      return {
        id: current.id,
        entityVersion: current.entityVersion + 1,
        deletedAt,
        syncStatus: "clean",
      };
    },
  };
}

function createDemoApplications(now: Date): ApplicationRecord[] {
  const sample = (
    daysAgo: number,
    value: Pick<ApplicationRecord, "companyName" | "roleName" | "status">,
  ): ApplicationRecord => {
    const timestamp = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
    return {
      id: crypto.randomUUID(),
      jdId: "jd-001",
      resumeId: "resume-001",
      companyName: value.companyName,
      roleName: value.roleName,
      jdTitleSnapshot: "高级前端工程师 · 星河科技",
      resumeTitleSnapshot: "高级前端工程师简历",
      deliveryMethod: "form_fill",
      targetUrl: "https://example.com/jobs/frontend",
      appliedAt: timestamp,
      status: value.status,
      pendingConfirmation: false,
      source: "manual",
      dedupeKey: null,
      companyBusiness: "企业级协作软件",
      roleSummary: "负责前端架构和设计系统建设",
      companyCulture: "强调用户价值与工程质量",
      rejectionReason: value.status === "rejected" ? "岗位方向调整" : null,
      entityVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      syncStatus: "clean",
    };
  };
  return [
    sample(1, { companyName: "星河科技", roleName: "高级前端工程师", status: "applied" }),
    sample(3, { companyName: "云端智能", roleName: "AI 产品经理", status: "screening" }),
    sample(6, { companyName: "远山网络", roleName: "前端技术负责人", status: "interviewing" }),
    sample(12, { companyName: "木棉数据", roleName: "产品工程师", status: "offer" }),
    sample(18, { companyName: "海岸实验室", roleName: "Web 工程师", status: "rejected" }),
  ];
}
