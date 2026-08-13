import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { UserProfileReader } from "../api/types.js";
import { ApprovalManager } from "../approvals/approval-manager.js";
import {
  createProfileUpdateApprovalDraft,
  createProfileUpdateApprovalPayload,
} from "../profile/approval-draft.js";
import type {
  ProfileContactUpdate,
  ProfileImportField,
  ProfileProposalExecutor,
} from "../profile/types.js";
import {
  normalizeResumeContact,
  type ResumeContactField,
} from "../resume/contracts/profile-contact.js";

const CONTACT_FIELDS: readonly ResumeContactField[] = [
  "fullName",
  "phone",
  "contactEmail",
  "location",
  "linkedinUrl",
  "githubUrl",
  "personalWebsite",
];

const fieldSchema = Type.String({
  minLength: 1,
  maxLength: 320,
  description: "用户明确提供的资料值（含用户附件的解析原文中明确出现的值）；不要猜测或补全。",
});

const parameters = Type.Object({
  fullName: Type.Optional(fieldSchema),
  phone: Type.Optional(fieldSchema),
  contactEmail: Type.Optional(fieldSchema),
  location: Type.Optional(fieldSchema),
  linkedinUrl: Type.Optional(fieldSchema),
  githubUrl: Type.Optional(fieldSchema),
  personalWebsite: Type.Optional(fieldSchema),
});

export function createPrepareProfileUpdateTool(
  profileReader: UserProfileReader,
  profileProposals: ProfileProposalExecutor,
  approvalManager: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_profile_update",
    label: "准备更新个人资料",
    description:
      "用户明确要求填写或更新个人资料时调用；或简历生成因 profile 缺少必填 header 字段（姓名/电话/简历联系邮箱）而失败、" +
      "且用户明确提供的附件原文中包含这些值时，可先解析附件再调用。同一条用户消息或同一次附件解析中明确给出的全部资料字段，" +
      "必须一次性完整传入；只传入用户已提供或附件原文明确出现的值，禁止猜测或从经历正文推断。" +
      "本工具会创建包含当前值和新值的审批，绝不会直接写入；等待用户在宿主中接受后才会同步。",
    parameters,
    execute: async (_toolCallId, params) => {
      const profile = await profileReader.getUserProfile();
      const changes = readChanges(params, profile);
      const expected = expectedFields(changes, profile);
      const proposal = await profileProposals.prepareImport(changes, expected);
      const approval = await approvalManager.request(
        createProfileUpdateApprovalDraft(proposal),
        createProfileUpdateApprovalPayload(proposal),
      );
      const summary = {
        proposalId: proposal.id,
        updatedFields: expected.map(({ field }) => field),
        approvalRequestId: approval.id,
        instruction:
          "宿主已显示包含当前值与新值的待决策项。请等待用户接受或拒绝；不要声称资料已经更新。",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary) }],
        details: summary,
      };
    },
  };
}

function readChanges(
  params: Record<string, string | undefined>,
  profile: Awaited<ReturnType<UserProfileReader["getUserProfile"]>>,
): ProfileContactUpdate {
  const normalized = normalizeResumeContact({
    fullName: profile.fullName,
    phone: profile.phone,
    contactEmail: profile.contactEmail,
    location: profile.location,
    linkedinUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl,
    personalWebsite: profile.personalWebsite,
    ...params,
  });
  const changes: ProfileContactUpdate = {};
  for (const field of CONTACT_FIELDS) {
    if (params[field] === undefined) continue;
    const value = normalized[field];
    if (!value) throw new Error(`${profileFieldLabel(field)}不能为空`);
    if (value !== profile[field]) changes[field] = value;
  }
  if (!Object.keys(changes).length) {
    throw new Error("提供的信息与当前个人资料一致，无需更新");
  }
  return changes;
}

function expectedFields(
  changes: ProfileContactUpdate,
  profile: Awaited<ReturnType<UserProfileReader["getUserProfile"]>>,
): ProfileImportField[] {
  return CONTACT_FIELDS.flatMap((field) => {
    const proposedValue = changes[field];
    return proposedValue === undefined || proposedValue === null
      ? []
      : [{
        field,
        currentValue: profile[field],
        proposedValue,
        selectedByDefault: true,
        confidence: "high" as const,
      }];
  });
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
