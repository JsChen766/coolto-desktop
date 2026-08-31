import type { JdRecord } from "../../../../../api/types";
import { projectJobRepository } from "../../../../../job-assets/repository-projection";
import type { DesktopApi } from "@desktop/types";

import { createDemoApplications } from "./demo-application-api";
import { createDemoLibraryEntries } from "./demo-resume-data";

export function createDemoJobAssetsApi(now: Date): DesktopApi["jobAssets"] {
  return {
    get: async () => projectJobRepository({
      jds: createDemoJds(now),
      resumes: createDemoLibraryEntries(),
      applications: createDemoApplications(now),
      deliveryResumeFiles: [],
    }),
  };
}

function createDemoJds(now: Date): JdRecord[] {
  return [
    jd(now, {
      id: "jd-001",
      title: "高级前端工程师 · 星河科技",
      company: "星河科技",
      targetRole: "高级前端工程师",
      rawText: "负责企业级前端架构、设计系统与性能治理。",
      requirements: [
        requirement("掌握 TypeScript 与 Vue 生态", "technology", "must_have"),
        requirement("具备大型前端项目架构经验", "qualification", "preferred"),
      ],
    }),
    jd(now, {
      id: "jd-002",
      title: "AI 产品经理 · 云端智能",
      company: "云端智能",
      targetRole: "AI 产品经理",
      rawText: "负责 AI 产品从需求分析、模型能力评估到上线验证。",
      requirements: [
        requirement("具备 AI 产品落地经验", "domain", "must_have"),
        requirement("能够协调工程、设计与业务团队", "soft_skill", "preferred"),
      ],
    }),
    jd(now, {
      id: "jd-003",
      title: "产品工程师 · 木棉数据",
      company: "木棉数据",
      targetRole: "产品工程师",
      rawText: "负责快速验证数据产品和内部工具。",
      requirements: [
        requirement("能够独立完成产品原型", "responsibility", "must_have"),
      ],
    }),
  ];
}

function jd(
  now: Date,
  input: Pick<JdRecord, "id" | "title" | "company" | "targetRole" | "rawText" | "requirements">,
): JdRecord {
  const timestamp = now.toISOString();
  return {
    ...input,
    sourceKind: "pasted",
    sourceUrl: null,
    jdHash: null,
    requirementMapId: null,
    requirementsOrigin: "app_extracted",
    sourceThreadId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    entityVersion: 1,
    deletedAt: null,
    syncStatus: input.id === "jd-002" ? "pending" : "clean",
  };
}

function requirement(
  text: string,
  category: string,
  importance: "must_have" | "preferred",
) {
  return {
    id: crypto.randomUUID(),
    text,
    category,
    importance: importance === "must_have" ? "high" as const : "medium" as const,
    keywords: [],
    weight: null,
    v2Importance: importance,
    v2Category: category,
  };
}
