import { randomUUID } from "node:crypto";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { UserProfileReader } from "../api/types.js";
import { ApprovalManager } from "../approvals/approval-manager.js";
import {
  createProfileUpdateApprovalDraft,
  createProfileUpdateApprovalPayload,
} from "../profile/approval-draft.js";
import {
  normalizeCareerProfileChangeSet,
  type CareerTargetInputV1,
} from "../profile/career-targets.js";
import type {
  ProfileChangeSet,
  ProfileProposalExecutor,
} from "../profile/types.js";
import {
  normalizeResumeContact,
  type ResumeContactField,
} from "../resume/contracts/profile-contact.js";

const CONTACT_FIELDS: readonly ResumeContactField[] = [
  "fullName", "phone", "contactEmail", "location", "linkedinUrl", "githubUrl", "personalWebsite",
];
const CAREER_FIELDS = [
  "currentTitle", "currentCompany", "yearsOfExperience", "careerStage",
  "careerTargets", "preferredLanguage", "resumeStyle",
] as const;
const fieldSchema = Type.String({ minLength: 1, maxLength: 320 });
const nullableFieldSchema = Type.Optional(Type.Union([fieldSchema, Type.Null()]));
const targetSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  idKind: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  role: nullableFieldSchema,
  industries: Type.Optional(Type.Array(fieldSchema, { maxItems: 20 })),
  locations: Type.Optional(Type.Array(fieldSchema, { maxItems: 20 })),
  isPrimary: Type.Optional(Type.Boolean()),
});
const parameters = Type.Object({
  fullName: nullableFieldSchema, phone: nullableFieldSchema,
  contactEmail: nullableFieldSchema, location: nullableFieldSchema,
  linkedinUrl: nullableFieldSchema, githubUrl: nullableFieldSchema,
  personalWebsite: nullableFieldSchema,
  currentTitle: nullableFieldSchema, currentCompany: nullableFieldSchema,
  yearsOfExperience: Type.Optional(Type.Union([Type.Integer({ minimum: 0, maximum: 80 }), Type.Null()])),
  careerStage: nullableFieldSchema,
  careerTargets: Type.Optional(Type.Array(targetSchema, { maxItems: 20 })),
  preferredLanguage: Type.Optional(fieldSchema), resumeStyle: Type.Optional(fieldSchema),
});

type ProfileToolParams = Record<string, unknown>;

export function createPrepareProfileUpdateTool(
  profileReader: UserProfileReader,
  profileProposals: ProfileProposalExecutor,
  approvalManager: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_profile_update",
    label: "准备更新个人资料",
    description:
      "仅在用户明确要求更新长期 Profile 时调用。Profile 是长期职业背景与简历默认值，不是 Experience 事实，也不是 Preference 习惯，也不是本轮临时指令。一次只传入用户明确提供的字段或目标；禁止猜测、从经历推断、臆造空字段或直接写入。本轮临时称呼/城市/目标不得调用本工具。工具只创建审批，用户接受后才写入本机。",
    parameters,
    execute: async (_toolCallId, params) => {
      const profile = await profileReader.getUserProfile();
      const changes = readChanges(params as ProfileToolParams, profile);
      const proposal = await profileProposals.prepareUpdate(changes, "manual");
      const approval = await approvalManager.request(
        createProfileUpdateApprovalDraft(proposal),
        createProfileUpdateApprovalPayload(proposal),
      );
      const summary = {
        proposalId: proposal.id,
        updatedFields: Object.keys(changes),
        approvalRequestId: approval.id,
        instruction: "宿主已显示包含当前值与新值的 Profile 待决策项。请等待用户接受或拒绝，不要声称资料已经更新。",
      };
      return { content: [{ type: "text", text: JSON.stringify(summary) }], details: summary };
    },
  };
}

function readChanges(params: ProfileToolParams, profile: Awaited<ReturnType<UserProfileReader["getUserProfile"]>>): ProfileChangeSet {
  const normalizedContact = normalizeResumeContact({
    fullName: profile.fullName, phone: profile.phone, contactEmail: profile.contactEmail,
    location: profile.location, linkedinUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl, personalWebsite: profile.personalWebsite,
    ...Object.fromEntries(CONTACT_FIELDS.map((field) => [field, params[field]])),
  });
  const changes: ProfileChangeSet = {};
  for (const field of CONTACT_FIELDS) {
    if (params[field] === undefined) continue;
    const value = normalizedContact[field];
    if (value === null) {
      if (profile[field] !== null) changes[field] = null;
      continue;
    }
    if (!value) throw new Error(`${profileFieldLabel(field)}不能为空`);
    if (value !== profile[field]) changes[field] = value;
  }
  const careerInput = Object.fromEntries(
    CAREER_FIELDS.filter((field) => params[field] !== undefined)
      .map((field) => [field, field === "careerTargets" ? addTargetIds(params[field]) : params[field]]),
  );
  if (Object.keys(careerInput).length) Object.assign(changes, normalizeCareerProfileChangeSet(careerInput));
  if (!Object.keys(changes).length) throw new Error("提供的信息与当前 Profile 一致，无需更新");
  return changes;
}

function addTargetIds(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((target) => {
    if (!target || typeof target !== "object" || Array.isArray(target)) return target;
    const item = target as CareerTargetInputV1;
    return item.id ? item : { ...item, id: randomUUID(), idKind: "opaque" };
  });
}

function profileFieldLabel(field: ResumeContactField): string {
  return {
    fullName: "姓名", phone: "电话", contactEmail: "简历联系邮箱", location: "所在地",
    linkedinUrl: "LinkedIn", githubUrl: "GitHub", personalWebsite: "个人网站",
  }[field];
}
