import type { Ref } from "vue";
import { ref } from "vue";

import type { ApplicationCreateInput, JdChatReference } from "@desktop/types";
import {
  defaultJobRepositoryNavigation,
  type JobRepositoryNavigationState,
} from "../job-assets/job-repository-navigation";
import { buildJdActionInstruction } from "../../../../job-assets/job-action-instruction.js";
import type {
  TrackerAssetTarget,
  TrackerNavigationContext,
} from "../tracker/tracker-navigation";
import type { AppView } from "./use-app-shell";

interface JobFlowDependencies {
  activeView: Ref<AppView>;
  closeNarrowSidebar(): void;
  createChat(): Promise<void>;
  send(text: string, reference?: JdChatReference): Promise<void>;
}

export function useJobFlowNavigation(deps: JobFlowDependencies) {
  const jobRepositoryNavigation = ref(defaultJobRepositoryNavigation());
  const trackerContext = ref<TrackerNavigationContext>({});

  function openRepositoryTracker(
    asset: TrackerAssetTarget,
    create?: Partial<ApplicationCreateInput>,
  ): void {
    deps.closeNarrowSidebar();
    trackerContext.value = {
      asset,
      ...(create ? { create } : {}),
      returnToRepository: copyNavigation(jobRepositoryNavigation.value),
    };
    deps.activeView.value = "tracker";
  }

  function closeTracker(): void {
    deps.activeView.value = trackerContext.value.returnToRepository ? "library" : "chat";
    trackerContext.value = {};
  }

  function updateRepositoryNavigation(state: JobRepositoryNavigationState): void {
    jobRepositoryNavigation.value = copyNavigation(state);
  }

  function openTrackerAsset(kind: "jd" | "resume", id: string): void {
    const next = copyNavigation(jobRepositoryNavigation.value);
    next.view = kind === "jd" ? "jobs" : "resumes";
    next.detailOpen = true;
    next.query = "";
    if (kind === "jd") {
      next.jobFilter = "";
      next.selectedJdId = id;
    } else {
      next.resumeFilter = "";
      next.selectedResumeId = id;
    }
    jobRepositoryNavigation.value = next;
    trackerContext.value = {};
    deps.activeView.value = "library";
  }

  function openDeliveryResumeFile(fileId: string): void {
    const next = copyNavigation(jobRepositoryNavigation.value);
    next.view = "resumes";
    next.detailOpen = true;
    next.query = "";
    next.resumeFilter = "";
    next.selectedResumeId = `delivery:${fileId}`;
    jobRepositoryNavigation.value = next;
    deps.activeView.value = "library";
  }

  async function startJdAction(
    action: "generate" | "match",
    jdId: string,
    title: string,
  ): Promise<void> {
    await deps.createChat();
    await deps.send(buildJdActionInstruction(action, title), {
      action,
      jdId,
      title,
    });
  }

  async function startGeneralResume(): Promise<void> {
    await deps.createChat();
    await deps.send(
      "请基于我的全部经历生成一份不关联任何 JD 的高质量一页通用简历。",
    );
  }

  return {
    closeTracker,
    jobRepositoryNavigation,
    openRepositoryTracker,
    openDeliveryResumeFile,
    openTrackerAsset,
    startJdAction,
    startGeneralResume,
    trackerContext,
    updateRepositoryNavigation,
  };
}

function copyNavigation(
  value: JobRepositoryNavigationState,
): JobRepositoryNavigationState {
  return {
    view: value.view,
    query: value.query,
    jobFilter: value.jobFilter,
    resumeFilter: value.resumeFilter,
    selectedJdId: value.selectedJdId,
    selectedResumeId: value.selectedResumeId,
    detailOpen: value.detailOpen,
  };
}
