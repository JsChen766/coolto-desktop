import type { ApprovalDraft } from "../approvals/types.js";
import type { ExperienceWriteProposal } from "./maintenance-types.js";
import { EXPERIENCE_CATEGORY_LABELS } from "./timeline-labels.js";

export const EXPERIENCE_MAINTENANCE_ACTION_TYPE = "experience.maintenance";

export interface ExperienceMaintenanceApprovalPayload {
  proposalIds: string[];
}

export function createExperienceMaintenanceApprovalDraft(
  proposals: readonly ExperienceWriteProposal[],
): ApprovalDraft {
  return {
    actionType: EXPERIENCE_MAINTENANCE_ACTION_TYPE,
    scopeKey: EXPERIENCE_MAINTENANCE_ACTION_TYPE,
    risk: "write",
    title: proposals.length > 1 ? "批量修正经历" : "修正经历",
    description: "接受后才会把以下新建或修改加入本地同步队列；拒绝不会改变经历仓库。",
    preview: {
      summary: [{ label: "待处理经历", value: `${proposals.length} 条` }],
      items: proposals.map((proposal) => ({
        title: proposal.next?.title ?? proposal.current?.title ?? proposal.experienceId,
        description: proposal.kind === "create" ? "新建经历" : "更新现有经历",
        fields: proposalFields(proposal),
      })),
    },
  };
}

export function createExperienceMaintenancePayload(
  proposals: readonly ExperienceWriteProposal[],
): ExperienceMaintenanceApprovalPayload {
  return { proposalIds: proposals.map((proposal) => proposal.id) };
}

export function readExperienceMaintenancePayload(
  value: unknown,
): ExperienceMaintenanceApprovalPayload {
  const ids = value && typeof value === "object"
    ? (value as { proposalIds?: unknown }).proposalIds : undefined;
  if (!Array.isArray(ids) || !ids.length ||
    ids.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("经历修正审批 Payload 无效");
  }
  return { proposalIds: [...ids] };
}

function proposalFields(proposal: ExperienceWriteProposal) {
  const next = proposal.next;
  if (!next) return [];
  const values = [
    ["类别", EXPERIENCE_CATEGORY_LABELS[next.category]],
    ["组织", next.organization], ["角色", next.role],
    ["开始", next.startDate], ["结束", next.endDate],
    ["标签", next.tags.join("、")],
    ["正文", shorten(next.content, 1_200)],
  ] as const;
  return values.flatMap(([label, value]) => value ? [{ label, value }] : []);
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
