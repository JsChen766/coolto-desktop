import type { ApprovalDraft, ApprovalPreviewItem } from "../approvals/types.js";
import type { UserProfile } from "../api/types.js";
import type { ProfileWriteProposal } from "./types.js";

export const PROFILE_UPDATE_ACTION_TYPE = "profile.update";
export const PROFILE_UPDATE_APPROVAL_SCOPE = "profile.update";

export interface ProfileUpdateApprovalPayload {
  proposalId: string;
}

const CONTACT_FIELDS = [
  "fullName", "phone", "contactEmail", "location",
  "linkedinUrl", "githubUrl", "personalWebsite",
] as const;

export function createProfileUpdateApprovalDraft(
  proposal: ProfileWriteProposal,
): ApprovalDraft {
  if (!proposal.next && proposal.kind !== "accept_server") {
    throw new Error("个人资料更新提案缺少目标值");
  }
  const profileFields = proposal.next
    ? CONTACT_FIELDS
      .filter((field) => proposal.current[field] !== proposal.next![field])
      .map((field) => ({
        field, label: profileFieldLabel(field),
        currentValue: proposal.current[field],
        proposedValue: proposal.next![field] ?? "",
        selectedByDefault: true,
        confidence: "high" as const,
      }))
    : [];
  const items = proposal.next ? profileItems(proposal.current, proposal.next) : [];
  if (!profileFields.length && !items.length && proposal.kind !== "accept_server") {
    throw new Error("个人资料没有需要更新的字段");
  }
  return {
    actionType: PROFILE_UPDATE_ACTION_TYPE,
    scopeKey: PROFILE_UPDATE_APPROVAL_SCOPE,
    risk: "write",
    title: proposal.kind === "accept_server" ? "接受服务端个人资料" : "更新个人资料",
    description: proposal.kind === "accept_server"
      ? "接受后将以最新服务端版本替换本机个人资料。"
      : "接受后会通过 Coolto 同步协议更新个人资料。",
    preview: {
      summary: [
        { label: "待更新字段", value: `${profileFields.length + items.length} 项` },
        { label: "Profile 版本", value: String(proposal.current.entityVersion ?? "未知") },
      ],
      ...(profileFields.length ? { profileFields } : {}),
      ...(items.length ? { items } : {}),
    },
  };
}

export function createProfileUpdateApprovalPayload(
  proposal: ProfileWriteProposal,
): ProfileUpdateApprovalPayload {
  return { proposalId: proposal.id };
}

function profileItems(current: UserProfile, next: UserProfile): ApprovalPreviewItem[] {
  const items: ApprovalPreviewItem[] = [];
  const currentTargets = current.careerTargets ?? [];
  const nextTargets = next.careerTargets ?? [];
  if (JSON.stringify(currentTargets) !== JSON.stringify(nextTargets)) {
    items.push({
      title: "求职目标",
      fields: [
        { label: "当前目标", value: formatTargets(currentTargets) },
        { label: "新目标", value: formatTargets(nextTargets) },
      ],
    });
  }
  if (current.currentTitle !== next.currentTitle ||
      current.currentCompany !== next.currentCompany ||
      current.yearsOfExperience !== next.yearsOfExperience ||
      current.careerStage !== next.careerStage) {
    items.push({
      title: "当前职业",
      fields: [
        { label: "当前值", value: formatCareer(current) },
        { label: "新值", value: formatCareer(next) },
      ],
    });
  }
  if (current.preferredLanguage !== next.preferredLanguage ||
      current.resumeStyle !== next.resumeStyle) {
    items.push({
      title: "简历默认设置",
      fields: [
        { label: "当前值", value: `${current.preferredLanguage ?? "未设置"} / ${current.resumeStyle ?? "未设置"}` },
        { label: "新值", value: `${next.preferredLanguage ?? "未设置"} / ${next.resumeStyle ?? "未设置"}` },
      ],
    });
  }
  return items;
}

function formatTargets(targets: readonly {
  role: string | null;
  industries: readonly string[];
  locations: readonly string[];
  isPrimary: boolean;
}[]): string {
  if (!targets.length) return "未设置";
  return targets.map((target) => {
    const values = [target.role, ...target.industries, ...target.locations].filter(Boolean);
    return `${target.isPrimary ? "主要：" : ""}${values.join(" · ")}`;
  }).join("；");
}

function formatCareer(profile: UserProfile): string {
  return [
    profile.currentTitle, profile.currentCompany,
    profile.yearsOfExperience === null || profile.yearsOfExperience === undefined
      ? null : `${profile.yearsOfExperience} 年`,
    profile.careerStage,
  ].filter(Boolean).join(" · ") || "未填写";
}

function profileFieldLabel(field: typeof CONTACT_FIELDS[number]): string {
  return {
    fullName: "姓名", phone: "电话", contactEmail: "简历联系邮箱",
    location: "所在地", linkedinUrl: "LinkedIn",
    githubUrl: "GitHub", personalWebsite: "个人网站",
  }[field];
}
