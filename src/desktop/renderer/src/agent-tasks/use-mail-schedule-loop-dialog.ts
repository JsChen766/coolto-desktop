import { reactive, shallowRef, watch } from "vue";

import type {
  AgentTaskProposalView,
  DesktopApi,
  MailConnectionView,
} from "../../../shared/types.js";
import { desktopErrorMessage } from "../chat/desktop-error-message.js";

export function useMailScheduleLoopDialog(input: {
  api: DesktopApi;
  conversationId: string;
  connections: MailConnectionView[];
  started(taskId: string): void;
}) {
  const stage = shallowRef<"configure" | "review">("configure");
  const proposal = shallowRef<AgentTaskProposalView>();
  const busy = shallowRef(false);
  const error = shallowRef<string>();
  const form = reactive({
    goal: "识别求职邮件，并把确认后的面试安排写入 App 日程",
    browserWebmail: true,
    allowedDomains: "",
    received: true,
    sent: false,
    mailConnectionIds: [] as string[],
    pollIntervalMinutes: 15,
    expiryDays: 30,
  });
  watch(() => form.browserWebmail, (enabled) => {
    if (!enabled) form.sent = false;
  });

  function toggleConnection(id: string, checked: boolean): void {
    form.mailConnectionIds = checked
      ? [...new Set([...form.mailConnectionIds, id])]
      : form.mailConnectionIds.filter((item) => item !== id);
  }
  async function review(): Promise<void> {
    if (!input.conversationId) return fail("当前任务对话不可用");
    const directions = [
      ...(form.received ? ["received" as const] : []),
      ...(form.sent ? ["sent" as const] : []),
    ];
    if (!directions.length) return fail("请至少选择收件或发件");
    if (!form.browserWebmail && !form.mailConnectionIds.length) {
      return fail("请选择 Browser Webmail 或一个已连接邮箱");
    }
    if (!form.browserWebmail && form.sent) {
      return fail("发件识别需要 Browser Webmail；邮箱直连仅支持收件");
    }
    const allowedDomains = splitDomains(form.allowedDomains);
    if (form.browserWebmail && !allowedDomains.length) {
      return fail("使用 Browser Webmail 时请填写邮箱域名");
    }
    busy.value = true; error.value = undefined;
    try {
      proposal.value = await input.api.agentTasks.prepareMailScheduleLoop({
        conversationId: input.conversationId, goal: form.goal.trim(), directions,
        browserWebmail: form.browserWebmail,
        mailConnectionIds: form.mailConnectionIds,
        allowedDomains,
        pollIntervalMinutes: form.pollIntervalMinutes,
        expiresAt: new Date(Date.now() + form.expiryDays * 86_400_000).toISOString(),
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

function splitDomains(value: string): string[] {
  return [...new Set(value.split(/[\s,，;；]+/u).map((item) => item.trim()).filter(Boolean))];
}
