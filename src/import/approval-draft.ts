import type { ApprovalDraft } from "../approvals/types.js";
import type {
  ExperienceImportCandidate,
  ExperienceImportProposal,
} from "./types.js";
import type { ResumeContactField } from "../resume/contracts/profile-contact.js";

export const EXPERIENCE_IMPORT_ACTION_TYPE = "experience.import";
export const EXPERIENCE_IMPORT_APPROVAL_SCOPE = "experience.import";

export interface ExperienceImportApprovalPayload {
  proposalId: string;
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
    title: proposal.profileFields.length
      ? `导入个人资料与 ${pending.length} 条经历`
      : `写入 ${pending.length} 条经历`,
    description:
      "接受后会先保存到本机经历库，并由同步队列自动上传云端。",
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
        id: item.candidate.clientId,
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
      ...(proposal.profileFields.length
        ? { profileFields: proposal.profileFields.map((field) => ({
          ...field, label: profileFieldLabel(field.field),
        })) }
        : {}),
    },
  };
}

export function createExperienceImportApprovalPayload(
  proposal: ExperienceImportProposal,
): ExperienceImportApprovalPayload {
  return {
    proposalId: proposal.id,
  };
}

function profileFieldLabel(field: ResumeContactField): string {
  return {
    fullName: "姓名", phone: "电话", contactEmail: "简历联系邮箱",
    location: "所在地", linkedinUrl: "LinkedIn", githubUrl: "GitHub",
    personalWebsite: "个人网站",
  }[field];
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
