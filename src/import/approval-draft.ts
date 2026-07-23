import type { ApprovalDraft } from "../approvals/types.js";
import type {
  ExperienceImportCandidate,
  ExperienceImportProposal,
} from "./types.js";

export const EXPERIENCE_IMPORT_ACTION_TYPE = "experience.import";
export const EXPERIENCE_IMPORT_APPROVAL_SCOPE = "experience.import";

export interface ExperienceImportApprovalPayload {
  proposalId: string;
  candidates: ExperienceImportCandidate[];
}

export function createExperienceImportApprovalDraft(
  proposal: ExperienceImportProposal,
): ApprovalDraft {
  const pending = proposal.candidates.filter(
    (item) => item.selected && !item.savedExperienceId,
  );
  const duplicates = proposal.candidates.filter(
    (item) => item.duplicateOf !== undefined,
  );

  return {
    actionType: EXPERIENCE_IMPORT_ACTION_TYPE,
    scopeKey: EXPERIENCE_IMPORT_APPROVAL_SCOPE,
    risk: "write",
    title: `写入 ${pending.length} 条经历`,
    description:
      "接受后会把以下结构化经历写入 Coolto 云端经历库。",
    preview: {
      summary: [
        { label: "待写入", value: `${pending.length} 条` },
        { label: "疑似重复", value: `${duplicates.length} 条` },
        {
          label: "来源",
          value: proposal.sourceLabel ?? proposal.sourceType,
        },
      ],
      items: proposal.candidates.map((item) => ({
        title: item.candidate.title,
        description: item.candidate.content,
        fields: candidateFields(item.candidate),
        ...(!item.selected && item.duplicateOf
          ? {
              warning:
                `默认跳过：疑似与“${item.duplicateOf.title}”重复`,
            }
          : {}),
      })),
    },
  };
}

export function createExperienceImportApprovalPayload(
  proposal: ExperienceImportProposal,
): ExperienceImportApprovalPayload {
  return {
    proposalId: proposal.id,
    candidates: proposal.candidates
      .filter((item) => item.selected && !item.savedExperienceId)
      .map((item) => structuredClone(item.candidate)),
  };
}

function candidateFields(
  candidate: ExperienceImportProposal["candidates"][number]["candidate"],
) {
  return [
    { label: "类别", value: candidate.category },
    ...(candidate.organization
      ? [{ label: "组织", value: candidate.organization }]
      : []),
    ...(candidate.role ? [{ label: "角色", value: candidate.role }] : []),
    ...(candidate.startDate
      ? [{ label: "开始", value: candidate.startDate }]
      : []),
    ...(candidate.endDate
      ? [{ label: "结束", value: candidate.endDate }]
      : []),
  ];
}
