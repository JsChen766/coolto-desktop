import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ExperienceReader, UserProfileReader } from "../../api/types.js";
import { ApprovalManager } from "../../approvals/approval-manager.js";
import {
  createExperienceImportApprovalDraft,
  createExperienceImportApprovalPayload,
} from "../../import/approval-draft.js";
import { findCandidateDuplicates } from "../../import/duplicate-checker.js";
import { ExperienceImportProposalStore } from "../../import/proposal-store.js";
import { normalizeImportCandidate } from "../../import/validation.js";
import { normalizeProfileImport, type ParsedProfileImport } from "../../profile/import-normalizer.js";
import { importCandidateSchema } from "./candidate-schema.js";
import { parsedProfileSchema } from "./profile-schema.js";

const parameters = Type.Object({
  sourceType: Type.Union([Type.Literal("text"), Type.Literal("file")]),
  sourceLabel: Type.Optional(
    Type.String({
      description: "来源说明，例如粘贴文本或附件文件名。",
      maxLength: 300,
    }),
  ),
  candidates: Type.Array(importCandidateSchema, {
    minItems: 1,
    maxItems: 50,
  }),
  profile: Type.Optional(parsedProfileSchema),
});

export function createPrepareExperienceImportTool(
  reader: ExperienceReader,
  profiles: UserProfileReader | undefined,
  proposalStore: ExperienceImportProposalStore,
  approvalManager: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_experience_import",
    label: "准备经历导入",
    description:
      "用户要求从附件或文本导入时，在取得正文后必须调用本工具；不得由模型自行生成审批内容。把正文解析为个人资料字段和经历候选并向宿主发出待决策卡片，本工具不会写入。姓名只能来自正文，绝不能从文件名、来源说明或登录账号猜测。不能确定的字段不传；低置信度字段必须标为 low。经历必须提取原文中的每条独立经历，保留事实和指标，禁止编造。用户要求修改预览时，用完整修正后的数据再调用一次本工具。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const normalized = params.candidates.map((candidate, index) =>
        normalizeImportCandidate(
          {
            ...candidate,
            ...(candidate.resumeSection
              ? {
                  resumeSectionKey: candidate.resumeSection.key,
                  resumeSectionLabel: candidate.resumeSection.label,
                }
              : {}),
            tags: candidate.tags ?? [],
          },
          `candidate-${index + 1}`,
        ),
      );
      const duplicates = await findCandidateDuplicates(
        reader,
        normalized,
        signal,
      );
      const profileFields = await prepareProfileFields(profiles, params.profile);
      const proposal = proposalStore.create(
        params.sourceType,
        normalized,
        duplicates,
        params.sourceLabel,
        profileFields,
      );
      const approval = await approvalManager.request(
        createExperienceImportApprovalDraft(proposal),
        createExperienceImportApprovalPayload(proposal),
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              proposal,
              approvalRequestId: approval.id,
              instruction:
                "宿主已显示接受、拒绝和自定义回答的待决策卡片。请简要说明候选内容并等待用户通过卡片决定，不要要求用户输入确认短语。",
            }),
          },
        ],
        details: proposal,
      };
    },
  };
}

async function prepareProfileFields(
  profiles: UserProfileReader | undefined,
  input: ParsedProfileImport | undefined,
): Promise<ReturnType<typeof normalizeProfileImport>> {
  if (!input) return [];
  if (!profiles) throw new Error("个人资料读取服务不可用");
  const profile = await profiles.getUserProfile();
  const current = {
    fullName: profile.fullName, phone: profile.phone,
    contactEmail: profile.contactEmail, location: profile.location,
    linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl,
    personalWebsite: profile.personalWebsite,
  };
  return normalizeProfileImport(current, input);
}
