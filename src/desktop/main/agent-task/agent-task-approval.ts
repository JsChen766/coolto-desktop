import type { ApprovalDraft } from "../../../approvals/types.js";
import type { AgentTaskProposalView } from "../../shared/types.js";

export const AGENT_TASK_PROVISION_ACTION = "agent_task.provision";

export function createAgentTaskApprovalDraft(
  proposal: AgentTaskProposalView,
): ApprovalDraft {
  const kind = proposal.input.jobCriteria.loopKind ??
    (proposal.input.assetPolicy.submissionMode === "confirm_each"
      ? "resume_job_apply"
      : proposal.input.connectorPolicy?.appSchedule === true
        ? "mail_app_schedule" : undefined);
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
        { label: "允许站点", value: proposal.input.allowedDomains.join("、") || "无浏览器站点" },
        { label: "允许动作", value: allowedActionLabels(proposal.input.allowedActions) },
        ...(kind === "resume_job_apply" ? [
          { label: "投递简历", value: selectedResume(proposal.input.assetPolicy) },
          { label: "提交规则", value: submissionMode(proposal.input.assetPolicy) },
          { label: "最低匹配", value: "80%" },
          { label: "投递数量", value: "无业务上限，消耗用户 credit" },
        ] : []),
        ...(["mail_app_schedule", "risk_deadline_watch"].includes(String(kind)) ? [{
          label: "邮箱连接",
          value: readMailConnections(proposal.input.connectorPolicy),
        }] : []),
        ...(kind === "mail_app_schedule" ? [{
          label: "App 日程联动",
          value: readAppSchedule(proposal.input.connectorPolicy),
        }] : []),
        ...(["application_follow_up", "interview_briefing"].includes(String(kind))
          ? [{ label: "投递范围", value: "当前已冻结的 Application" }] : []),
        ...(kind === "application_strategy"
          ? [{ label: "分析范围", value: "当前账号的投递统计" }] : []),
        ...(typeof proposal.input.connectorPolicy?.autoStartAfter === "string"
          ? [{ label: "首次运行", value: proposal.input.connectorPolicy.autoStartAfter }] : []),
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

function allowedActionLabels(actions: string[]): string {
  const labels: Record<string, string> = {
    "browser.read": "读取授权网页", "browser.control": "控制授权网页",
    "browser.write": "填写授权网页", "browser.submit": "确认后提交表单",
    "browser.download": "下载文件", "browser.review": "审核填写字段",
    "task.lifecycle": "暂停、等待或完成任务",
    "jobs.search": "搜索岗位", "jobs.evaluate": "评估岗位",
    "tracker.application.read": "读取投递候选",
    "tracker.application.create": "确认后创建投递记录",
    "tracker.application.update": "确认后更新投递状态",
    "tracker.interview.update": "确认后更新面试日程",
    "resume.read": "读取已选简历",
    "jd.read": "读取 JD", "jd.write": "确认后保存 JD",
    "experience.read": "读取经历证据",
    "application.loop.read": "读取当前投递上下文",
    "follow_up.write": "记录跟进草稿", "briefing.write": "记录面试简报",
    "strategy.read": "读取投递统计", "strategy.write": "记录策略建议",
    "risk.write": "记录风险与截止提示", "reminder.prepare": "准备 App 提醒",
    "mail.read": "读取已授权求职邮件", "mail.classify": "分类求职邮件",
    "answers.read": "读取已确认常用答案", "answers.prepare": "准备常用答案确认",
  };
  return actions.map((action) => labels[action] ?? "其他受控应用动作").join("、");
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

function selectedResume(policy: Record<string, unknown>): string {
  return typeof policy.resumeTitle === "string" && policy.resumeTitle.trim()
    ? policy.resumeTitle : "未冻结";
}

function submissionMode(policy: Record<string, unknown>): string {
  return policy.submissionMode === "confirm_each"
    ? "每个岗位提交前单独确认" : "不允许自动提交";
}

function readAppSchedule(
  policy: AgentTaskProposalView["input"]["connectorPolicy"],
): string {
  if (policy?.appSchedule !== true) return "未授权";
  const directions = Array.isArray(policy.scheduleMailDirections)
    ? policy.scheduleMailDirections : [];
  const label = directions.map((value) => value === "sent" ? "发件" : "收件").join("、");
  return `${label || "未指定方向"}识别；写入前逐条确认`;
}
