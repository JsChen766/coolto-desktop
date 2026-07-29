import type { Ref } from "vue";
import { ref } from "vue";

import type { ApplicationCreateInput } from "@desktop/types";
import {
  defaultJobRepositoryNavigation,
  type JobRepositoryNavigationState,
} from "../job-assets/job-repository-navigation";
import type {
  TrackerAssetTarget,
  TrackerNavigationContext,
} from "../tracker/tracker-navigation";
import type { AppView } from "./use-app-shell";

interface JobFlowDependencies {
  activeView: Ref<AppView>;
  closeNarrowSidebar(): void;
  createChat(): Promise<void>;
  send(text: string): Promise<void>;
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

  async function startJdAction(
    action: "generate" | "match",
    jdId: string,
    title: string,
  ): Promise<void> {
    await deps.createChat();
    const instruction = action === "generate"
      ? `请针对 JD「${title}」（jdId: ${jdId}）生成针对性简历。`
      : `请针对 JD「${title}」（jdId: ${jdId}）匹配经历库并给出匹配结果。`;
    await deps.send(instruction);
  }

  return {
    closeTracker,
    jobRepositoryNavigation,
    openRepositoryTracker,
    openTrackerAsset,
    startJdAction,
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
