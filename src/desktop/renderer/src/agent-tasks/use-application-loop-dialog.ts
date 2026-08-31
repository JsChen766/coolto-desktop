import { reactive, shallowRef } from "vue";
import type {
  AgentTaskProposalView, ApplicationRecord, DesktopApi, InterviewRound,
} from "../../../shared/types.js";
import { desktopErrorMessage } from "../chat/desktop-error-message.js";

export function useApplicationLoopDialog(input: {
  api: DesktopApi; conversationId: string; application: ApplicationRecord;
  interviews: InterviewRound[]; kind: "follow_up" | "briefing";
  started(taskId: string): void;
}) {
  const stage = shallowRef<"configure" | "review">("configure");
  const proposal = shallowRef<AgentTaskProposalView>();
  const busy = shallowRef(false);
  const error = shallowRef<string>();
  const scheduled = input.interviews.filter((item) => item.status === "scheduled");
  const form = reactive({
    goal: input.kind === "follow_up"
      ? `跟进 ${input.application.companyName} 的 ${input.application.roleName} 投递`
      : `为 ${input.application.companyName} 的 ${input.application.roleName} 面试准备简报`,
    domains: "", checkIntervalHours: 24,
    interviewId: scheduled[0]?.id ?? "", wakeBeforeMinutes: 1440,
    expiryDays: 30,
  });
  async function review(): Promise<void> {
    if (!input.conversationId) return fail("当前任务对话不可用");
    busy.value = true; error.value = undefined;
    try {
      const common = {
        conversationId: input.conversationId, goal: form.goal.trim(),
        applicationId: input.application.id,
        expiresAt: new Date(Date.now() + form.expiryDays * 86_400_000).toISOString(),
      };
      proposal.value = input.kind === "follow_up"
        ? await input.api.agentTasks.prepareFollowUpLoop({
            ...common, allowedDomains: domains(form.domains),
            checkIntervalHours: form.checkIntervalHours,
          })
        : await input.api.agentTasks.prepareInterviewBriefingLoop({
            ...common, interviewId: form.interviewId,
            researchDomains: domains(form.domains),
            wakeBeforeMinutes: form.wakeBeforeMinutes,
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
  return { stage, proposal, busy, error, form, scheduled, review, start, edit };
}

function domains(value: string): string[] {
  return [...new Set(value.split(/[\s,，;；]+/u).map((item) => item.trim()).filter(Boolean))];
}
