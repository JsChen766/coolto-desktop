import { reactive, shallowRef } from "vue";

import type {
  AgentTaskProposalView,
  DesktopApi,
  JobRepositoryResume,
} from "../../../shared/types.js";
import { desktopErrorMessage } from "../chat/desktop-error-message.js";

export function useResumeJobLoopDialog(input: {
  api: DesktopApi;
  conversationId: string;
  resume: JobRepositoryResume;
  started(taskId: string): void;
}) {
  const stage = shallowRef<"configure" | "review">("configure");
  const proposal = shallowRef<AgentTaskProposalView>();
  const busy = shallowRef(false);
  const error = shallowRef<string>();
  const form = reactive({
    goal: `使用《${input.resume.entry.displayTitle}》寻找并投递匹配岗位`,
    sources: [{ provider: "greenhouse" as "greenhouse" | "lever", sourceKey: "", company: "" }],
    applicationDomains: "",
    expiryDays: 7,
  });

  function addSource(): void {
    if (form.sources.length < 4) {
      form.sources.push({ provider: "greenhouse", sourceKey: "", company: "" });
    }
  }
  function removeSource(index: number): void {
    if (form.sources.length > 1) form.sources.splice(index, 1);
  }
  async function review(): Promise<void> {
    const resumeId = input.resume.resumeId;
    if (!resumeId || !input.conversationId) return fail("当前简历或任务对话不可用");
    if (form.sources.some((item) => !item.sourceKey.trim() || !item.company.trim())) {
      return fail("请填写每个岗位源的公司和 Source Key");
    }
    busy.value = true; error.value = undefined;
    try {
      proposal.value = await input.api.agentTasks.prepareResumeJobLoop({
        conversationId: input.conversationId, goal: form.goal.trim(), resumeId,
        sources: form.sources.map((item) => ({
          provider: item.provider,
          sourceKey: item.sourceKey.trim(),
          company: item.company.trim(),
        })),
        applicationDomains: splitDomains(form.applicationDomains),
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
  return { stage, proposal, busy, error, form, addSource, removeSource, review, start, edit };
}

function splitDomains(value: string): string[] {
  return [...new Set(value.split(/[\s,，;；]+/u).map((item) => item.trim()).filter(Boolean))];
}
