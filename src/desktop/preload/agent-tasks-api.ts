import { ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/types.js";

export const agentTasksPreloadApi: DesktopApi["agentTasks"] = {
  list: () => ipcRenderer.invoke("agent-tasks:list"),
  get: (taskId) => ipcRenderer.invoke("agent-tasks:get", taskId),
  prepare: (input) => ipcRenderer.invoke("agent-tasks:prepare", input),
  prepareResumeJobLoop: (input) =>
    ipcRenderer.invoke("agent-tasks:prepare-resume-job-loop", input),
  prepareMailScheduleLoop: (input) =>
    ipcRenderer.invoke("agent-tasks:prepare-mail-schedule-loop", input),
  prepareFollowUpLoop: (input) =>
    ipcRenderer.invoke("agent-tasks:prepare-follow-up-loop", input),
  prepareInterviewBriefingLoop: (input) =>
    ipcRenderer.invoke("agent-tasks:prepare-interview-briefing-loop", input),
  prepareStrategyLoop: (input) =>
    ipcRenderer.invoke("agent-tasks:prepare-strategy-loop", input),
  prepareRiskDeadlineLoop: (input) =>
    ipcRenderer.invoke("agent-tasks:prepare-risk-deadline-loop", input),
  executeProposal: (id) => ipcRenderer.invoke("agent-tasks:execute-proposal", id),
  start: (id) => ipcRenderer.invoke("agent-tasks:start", id),
  resume: (id) => ipcRenderer.invoke("agent-tasks:resume", id),
  pause: (id) => ipcRenderer.invoke("agent-tasks:pause", id),
  cancel: (id) => ipcRenderer.invoke("agent-tasks:cancel", id),
  revoke: (id) => ipcRenderer.invoke("agent-tasks:revoke", id),
  submissionReceipt: (id) =>
    ipcRenderer.invoke("agent-tasks:submission-receipt", id),
};
