import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { ApprovalManager } from "../approvals/approval-manager.js";
import {
  createPreferenceApprovalDraft,
  createPreferenceApprovalPayload,
} from "../preference/approval-draft.js";
import type {
  PreferenceKeyV1,
  PreferenceMutationInputV1,
  PreferenceScopeV1,
  PreferenceValueV1,
} from "../preference/types.js";
import { PreferenceProposalService } from "../desktop/main/preference/preference-proposal-service.js";

const keySchema = Type.Union([
  Type.Literal("resume.tone"), Type.Literal("resume.bullet_style"),
  Type.Literal("resume.avoid_terms"), Type.Literal("job_search.location_priority"),
  Type.Literal("job_search.work_mode"),
]);
const scopeSchema = Type.Object({
  kind: Type.Union([
    Type.Literal("global"), Type.Literal("resume"), Type.Literal("job_search"),
    Type.Literal("browser_fill"), Type.Literal("interview"),
  ]),
  domain: Type.Optional(Type.String()), targetFingerprint: Type.Optional(Type.String()),
});
const parameters = Type.Object({
  action: Type.Union([
    Type.Literal("create"), Type.Literal("update"), Type.Literal("disable"),
    Type.Literal("enable"), Type.Literal("delete"),
  ]),
  preferenceId: Type.Optional(Type.String()), key: Type.Optional(keySchema),
  value: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  scope: Type.Optional(scopeSchema), priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
});

interface PreferenceToolParams {
  action: "create" | "update" | "disable" | "enable" | "delete";
  preferenceId?: string;
  key?: PreferenceKeyV1;
  value?: PreferenceValueV1;
  scope?: PreferenceScopeV1;
  priority?: number;
}

export function createPreparePreferenceChangeTool(
  preferences: PreferenceProposalService,
  approvals: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_preference_change",
    label: "准备偏好变更",
    description: "只为用户明确要求的已注册表达或求职习惯创建 Preference 审批。不会保存任意提示词、敏感信息或行为推断；本轮采用不等于长期保存。",
    parameters,
    execute: async (_toolCallId, params) => {
      const proposal = await prepareProposal(preferences, params as PreferenceToolParams);
      const approval = await approvals.request(
        createPreferenceApprovalDraft(proposal), createPreferenceApprovalPayload(proposal),
      );
      const result = {
        proposalId: proposal.id, approvalRequestId: approval.id,
        instruction: "已创建 Preference 审批，请等待用户确认；确认前不要声称已保存。",
      };
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  };
}

async function prepareProposal(
  preferences: PreferenceProposalService,
  params: PreferenceToolParams,
) {
  const id = params.preferenceId;
  if (params.action !== "create" && !id) throw new Error("该 Preference 操作需要 preferenceId");
  if (params.action === "create") {
    if (!params.key || params.value === undefined || !params.scope || params.priority === undefined) {
      throw new Error("创建 Preference 需要 key、value、scope 和 priority");
    }
    return preferences.prepareCreate({
      key: params.key, value: params.value, scope: params.scope, priority: params.priority,
    } as PreferenceMutationInputV1);
  }
  if (params.action === "disable") return preferences.prepareDisable(id!);
  if (params.action === "enable") return preferences.prepareEnable(id!);
  if (params.action === "delete") return preferences.prepareDelete(id!);
  return preferences.prepareUpdate(id!, {
    ...(params.key === undefined ? {} : { key: params.key }),
    ...(params.value === undefined ? {} : { value: params.value }),
    ...(params.scope === undefined ? {} : { scope: params.scope }),
    ...(params.priority === undefined ? {} : { priority: params.priority }),
  });
}
