import { reactive, shallowRef } from "vue";
import type {
  AgentTaskProposalView, DesktopApi, MailConnectionView,
} from "../../../shared/types.js";
import { desktopErrorMessage } from "../chat/desktop-error-message.js";

export function useGlobalAiLoopDialog(input: {
  api: DesktopApi; conversationId: string; connections: MailConnectionView[];
  kind: "strategy" | "risk"; started(taskId: string): void;
}) {
  const stage = shallowRef<"configure" | "review">("configure");
  const proposal = shallowRef<AgentTaskProposalView>();
  const busy = shallowRef(false);
  const error = shallowRef<string>();
  const form = reactive({
    goal: input.kind === "strategy"
      ? "复盘我的投递数据，提出下一阶段可确认的求职策略"
      : "识别求职邮件中的截止日期、待办与风险，并生成确认项",
    reviewIntervalDays: 7, browserWebmail: true, allowedDomains: "",
    mailConnectionIds: [] as string[], pollIntervalMinutes: 15, expiryDays: 30,
  });
  function toggleConnection(id: string, checked: boolean): void {
    form.mailConnectionIds = checked
      ? [...new Set([...form.mailConnectionIds, id])]
      : form.mailConnectionIds.filter((item) => item !== id);
  }
  async function review(): Promise<void> {
    if (!input.conversationId) return fail("当前任务对话不可用");
    const allowedDomains = domains(form.allowedDomains);
    if (input.kind === "risk" && !form.browserWebmail && !form.mailConnectionIds.length) {
      return fail("请选择 Browser Webmail 或一个已连接邮箱");
    }
    if (input.kind === "risk" && form.browserWebmail && !allowedDomains.length) {
      return fail("使用 Browser Webmail 时请填写邮箱域名");
    }
    busy.value = true; error.value = undefined;
    try {
      const common = {
        conversationId: input.conversationId, goal: form.goal.trim(),
        expiresAt: new Date(Date.now() + form.expiryDays * 86_400_000).toISOString(),
      };
      proposal.value = input.kind === "strategy"
        ? await input.api.agentTasks.prepareStrategyLoop({
            ...common, reviewIntervalDays: form.reviewIntervalDays,
          })
        : await input.api.agentTasks.prepareRiskDeadlineLoop({
            ...common, directions: ["received"], browserWebmail: form.browserWebmail,
            mailConnectionIds: form.mailConnectionIds, allowedDomains,
            pollIntervalMinutes: form.pollIntervalMinutes,
          });
      stage.value = "review";
    } catch (cause) { error.value = desktopErrorMessage(cause); }
    finally { busy.value = false; }
  }
  async function start(): Promise<void> {
    if (!proposal.value) return;
    busy.value = true; error.value = undefined;
    try {
      const detail = await input.api.agentTasks.executeProposal(proposal.value.id);
      input.started(detail.task.id);
    } catch (cause) { error.value = desktopErrorMessage(cause); }
    finally { busy.value = false; }
  }
  function edit(): void { stage.value = "configure"; proposal.value = undefined; }
  function fail(message: string): void { error.value = message; }
  return { stage, proposal, busy, error, form, toggleConnection, review, start, edit };
}

function domains(value: string): string[] {
  return [...new Set(value.split(/[\s,，;；]+/u).map((item) => item.trim()).filter(Boolean))];
}
