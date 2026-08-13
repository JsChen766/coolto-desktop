import type { ApprovalDraft } from "../approvals/types.js";
import type { ResumeContactField } from "../resume/contracts/profile-contact.js";
import type { ProfileWriteProposal } from "./types.js";

export const PROFILE_UPDATE_ACTION_TYPE = "profile.update";
export const PROFILE_UPDATE_APPROVAL_SCOPE = "profile.update";

export interface ProfileUpdateApprovalPayload {
  proposalId: string;
}

const CONTACT_FIELDS: readonly ResumeContactField[] = [
  "fullName",
  "phone",
  "contactEmail",
  "location",
  "linkedinUrl",
  "githubUrl",
  "personalWebsite",
];

export function createProfileUpdateApprovalDraft(
  proposal: ProfileWriteProposal,
): ApprovalDraft {
  if (!proposal.next) {
    throw new Error("个人资料更新提案缺少目标值");
  }
  const profileFields = CONTACT_FIELDS
    .filter((field) => proposal.current[field] !== proposal.next![field])
    .map((field) => ({
      field,
      label: profileFieldLabel(field),
      currentValue: proposal.current[field],
      proposedValue: proposal.next![field]!,
      selectedByDefault: true,
      confidence: "high" as const,
    }));
  if (!profileFields.length) {
    throw new Error("个人资料没有需要更新的字段");
  }
  return {
    actionType: PROFILE_UPDATE_ACTION_TYPE,
    scopeKey: PROFILE_UPDATE_APPROVAL_SCOPE,
    risk: "write",
    title: "更新个人资料",
    description: "接受后会通过 Coolto 同步协议更新个人资料。",
    preview: {
      summary: [{ label: "待更新字段", value: `${profileFields.length} 项` }],
      profileFields,
    },
  };
}

export function createProfileUpdateApprovalPayload(
  proposal: ProfileWriteProposal,
): ProfileUpdateApprovalPayload {
  return { proposalId: proposal.id };
}

function profileFieldLabel(field: ResumeContactField): string {
  return {
    fullName: "姓名",
    phone: "电话",
    contactEmail: "简历联系邮箱",
    location: "所在地",
    linkedinUrl: "LinkedIn",
    githubUrl: "GitHub",
    personalWebsite: "个人网站",
  }[field];
}
