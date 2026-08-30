import type { ApprovalDraft } from "../../../approvals/types.js";
import type { AgentTaskProposalView } from "../../shared/types.js";

export const AGENT_TASK_PROVISION_ACTION = "agent_task.provision";

export function createAgentTaskApprovalDraft(
  proposal: AgentTaskProposalView,
): ApprovalDraft {
  return {
    actionType: AGENT_TASK_PROVISION_ACTION,
    scopeKey: `agent-task:${proposal.input.conversationId}`,
    risk: "external",
    title: "允许 Agent 托管此任务",
    description:
      "确认不可变授权范围。任务只在 App 打开时运行；扩大范围必须重新授权。",
    preview: {
      summary: [
        { label: "目标", value: proposal.input.goal },
        { label: "允许站点", value: proposal.input.allowedDomains.join("、") },
        { label: "允许动作", value: proposal.input.allowedActions.join("、") },
        {
          label: "邮箱连接",
          value: readMailConnections(proposal.input.connectorPolicy),
        },
        { label: "最低匹配", value: "80%" },
        { label: "投递数量", value: "无业务上限，消耗用户 credit" },
        { label: "运行条件", value: "仅 App 打开时" },
        { label: "有效期至", value: proposal.input.expiresAt },
      ],
      warnings: [
        "求职邮件发送键永远由用户亲自点击。",
        "原始页面观察保留 7 天，普通动作回执保留 90 天。",
      ],
    },
  };
}

function readMailConnections(
  policy: AgentTaskProposalView["input"]["connectorPolicy"],
): string {
  const values = policy?.mailConnectionIds;
  const labels = policy?.browserWebmail === true ? ["浏览器 Webmail"] : [];
  if (Array.isArray(values)) {
    labels.push(...values.filter((value): value is string => typeof value === "string"));
  }
  return labels.length ? labels.join("、") : "未授权";
}
