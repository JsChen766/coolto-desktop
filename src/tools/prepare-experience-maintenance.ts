import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ApprovalManager } from "../approvals/approval-manager.js";
import type {
  ExperienceCategory,
  ExperienceCreateInput,
  ExperienceUpdateInput,
} from "../api/types.js";
import {
  createExperienceMaintenanceApprovalDraft,
  createExperienceMaintenancePayload,
} from "../experience/maintenance-approval.js";
import type { ResumeExperienceSyncProposalPort } from
  "../resume/material/experience-sync-port.js";
import { assertSingleEducationPeriod } from "../experience/material-partition.js";

const category = Type.Union([
  Type.Literal("work"), Type.Literal("project"), Type.Literal("education"),
  Type.Literal("volunteer"), Type.Literal("other"),
]);
const nullableText = Type.Union([Type.String({ maxLength: 200 }), Type.Null()]);
const nullableDate = Type.Union([Type.String({ maxLength: 10 }), Type.Null()]);
const resumeSection = Type.Union([
  Type.Object({
    key: Type.String({ minLength: 1, maxLength: 64 }),
    label: Type.String({ minLength: 1, maxLength: 120 }),
  }),
  Type.Null(),
]);
const fields = {
  category,
  title: Type.String({ minLength: 1, maxLength: 200 }),
  content: Type.String({ minLength: 1, maxLength: 30_000 }),
  organization: nullableText,
  role: nullableText,
  location: nullableText,
  startDate: nullableDate,
  endDate: Type.Union([nullableDate, Type.Literal("present")]),
  tags: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 40 }),
  resumeSection,
};
const operation = Type.Union([
  Type.Object({ kind: Type.Literal("create"), ...fields }),
  Type.Object({
    kind: Type.Literal("update"),
    experienceId: Type.String({ minLength: 1 }),
    ...fields,
  }),
]);
const parameters = Type.Object({
  operations: Type.Array(operation, { minItems: 1, maxItems: 5 }),
});

export function createPrepareExperienceMaintenanceTool(
  proposals: ResumeExperienceSyncProposalPort,
  approvals: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_experience_maintenance",
    label: "准备修正经历",
    description:
      "用户明确要求通过对话新建、修正或拆分 Experience 时使用。必须先读取现有经历；拆分时在一次调用中完整提交对原记录的 update 和新记录的 create。每项都是完整目标值，不能编造或省略用户要保留的事实。本工具只创建一张不可变审批卡，不会直接写入。",
    executionMode: "sequential",
    parameters,
    execute: async (_callId, params) => {
      const updateIds = params.operations.flatMap((operation) =>
        operation.kind === "update" ? [operation.experienceId] : []);
      if (new Set(updateIds).size !== updateIds.length) {
        throw new Error("一次经历修正不能重复更新同一条记录");
      }
      const prepared = [];
      try {
        for (const operation of params.operations) {
          if (operation.kind === "create") {
            if (!proposals.prepareCreate) throw new Error("经历新建 Proposal 不可用");
            prepared.push(await proposals.prepareCreate(createInput(operation)));
          } else {
            prepared.push(await proposals.prepareUpdate(
              operation.experienceId,
              updateInput(operation),
            ));
          }
        }
      } catch (error) {
        prepared.forEach((proposal) => proposals.discard(proposal.id));
        throw error;
      }
      let approval;
      try {
        approval = await approvals.request(
          createExperienceMaintenanceApprovalDraft(prepared),
          createExperienceMaintenancePayload(prepared),
        );
      } catch (error) {
        prepared.forEach((proposal) => proposals.discard(proposal.id));
        throw error;
      }
      const details = {
        approvalRequestId: approval.id,
        operationCount: prepared.length,
        instruction: "请等待用户通过程序确认卡接受、拒绝或提出修改意见。",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(details) }],
        details,
      };
    },
  };
}

interface OperationFields {
  category: ExperienceCategory;
  title: string;
  content: string;
  organization: string | null;
  role: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  resumeSection: { key: string; label: string } | null;
}

type Operation = OperationFields & (
  { kind: "create" } | { kind: "update"; experienceId: string }
);

function shared(operation: Operation) {
  const content = operation.content.trim();
  if (operation.category === "education") assertSingleEducationPeriod(content);
  return {
    category: operation.category,
    title: operation.title.trim(),
    content,
    organization: clean(operation.organization),
    role: clean(operation.role),
    location: clean(operation.location),
    startDate: clean(operation.startDate),
    endDate: clean(operation.endDate),
    tags: operation.tags.map((tag) => tag.trim()).filter(Boolean),
    resumeSectionKey: operation.resumeSection?.key ?? null,
    resumeSectionLabel: operation.resumeSection?.label ?? null,
    revisionSource: "app_generated" as const,
  };
}

function createInput(operation: Operation): ExperienceCreateInput {
  const value = shared(operation);
  return {
    category: value.category, title: value.title, content: value.content,
    ...(value.organization ? { organization: value.organization } : {}),
    ...(value.role ? { role: value.role } : {}),
    ...(value.location ? { location: value.location } : {}),
    ...(value.startDate ? { startDate: value.startDate } : {}),
    ...(value.endDate ? { endDate: value.endDate } : {}),
    tags: value.tags,
    ...(value.resumeSectionKey ? { resumeSectionKey: value.resumeSectionKey } : {}),
    ...(value.resumeSectionLabel ? { resumeSectionLabel: value.resumeSectionLabel } : {}),
    revisionSource: value.revisionSource,
  };
}

function updateInput(operation: Operation): ExperienceUpdateInput {
  return shared(operation);
}

function clean(value: string | null): string | null {
  return value?.trim() || null;
}
