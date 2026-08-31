import { computed, onMounted, ref, watch } from "vue";

import type {
  ApplicationRecord,
  ApplicationStatus,
  ApplicationUpdateInput,
  ApplicationWriteProposal,
} from "@desktop/types";
import {
  applicationsInColumn,
  type TrackerViewMode,
} from "./application-board";
import type { TrackerNavigationContext } from "./tracker-navigation";
import { useApplicationTracker } from "./use-application-tracker";

export function useApplicationTrackerPage(
  context: () => TrackerNavigationContext | undefined,
) {
  const tracker = useApplicationTracker();
  const query = ref("");
  const activeView = ref<TrackerViewMode>("board");
  const createOpen = ref(Boolean(context()?.create));
  const createProposal = ref<ApplicationWriteProposal>();
  const correctionProposal = ref<ApplicationWriteProposal>();
  const transitionTarget = ref<ApplicationStatus>();
  const transitionApplication = ref<ApplicationRecord>();
  const deleteTarget = ref<ApplicationRecord>();

  const filtered = computed(() => {
    const value = query.value.trim().toLocaleLowerCase();
    return tracker.applications.value.filter((application) => {
      const asset = context()?.asset;
      if (asset?.kind === "jd" && application.jdId !== asset.id) return false;
      if (asset?.kind === "resume" && application.resumeId !== asset.id) return false;
      return !value || [application.companyName, application.roleName].some((text) =>
        text.toLocaleLowerCase().includes(value),
      );
    });
  });
  const createInitial = computed(() => {
    if (context()?.create) return context()?.create;
    const asset = context()?.asset;
    if (asset?.kind === "jd") return { jdId: asset.id };
    if (asset?.kind === "resume") return { resumeId: asset.id };
    return undefined;
  });

  onMounted(async () => { await tracker.load(); focusApplication(context()?.applicationId); });
  watch(() => context()?.applicationId, focusApplication);

  function focusApplication(applicationId?: string): void {
    if (!applicationId) return;
    tracker.selected.value = tracker.applications.value.find((item) => item.id === applicationId);
    if (tracker.selected.value) activeView.value = "schedule";
  }

  function applicationsFor(statuses: readonly ApplicationStatus[]): ApplicationRecord[] {
    return applicationsInColumn(filtered.value, statuses);
  }

  function prepareTransition(application: ApplicationRecord, target: ApplicationStatus): void {
    transitionApplication.value = application;
    transitionTarget.value = target;
  }

  async function confirmTransition(reason: string | null): Promise<void> {
    if (!transitionApplication.value || !transitionTarget.value) return;
    try {
      await tracker.transition(transitionApplication.value, transitionTarget.value, reason);
      transitionApplication.value = undefined;
      transitionTarget.value = undefined;
    } catch { /* error is exposed by tracker */ }
  }

  async function updateSelected(changes: ApplicationUpdateInput): Promise<void> {
    const current = tracker.selected.value;
    if (!current) return;
    try {
      if (current.jdId !== changes.jdId || current.resumeId !== changes.resumeId) {
        correctionProposal.value = await tracker.prepareUpdate(current.id, changes);
      } else {
        await tracker.update(current.id, changes);
      }
    } catch { /* keep editor open */ }
  }

  async function prepareCreate(
    input: Parameters<typeof tracker.prepareCreate>[0],
  ): Promise<void> {
    try {
      createProposal.value = await tracker.prepareCreate(input);
    } catch { /* keep form open */ }
  }

  async function executeCreate(proposalId: string): Promise<void> {
    try {
      tracker.selected.value = await tracker.executeProposal(proposalId);
      createProposal.value = undefined;
      createOpen.value = false;
    } catch { /* keep proposal open */ }
  }

  async function executeCorrection(proposalId: string): Promise<void> {
    try {
      tracker.selected.value = await tracker.executeProposal(proposalId);
      correctionProposal.value = undefined;
    } catch { /* keep proposal open */ }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) return;
    try {
      await tracker.remove(deleteTarget.value);
      deleteTarget.value = undefined;
    } catch { /* keep confirmation open */ }
  }

  return {
    activeView,
    applicationsFor,
    confirmDelete,
    confirmTransition,
    correctionProposal,
    createInitial,
    createOpen,
    createProposal,
    deleteTarget,
    executeCorrection,
    executeCreate,
    filtered,
    prepareCreate,
    prepareTransition,
    query,
    tracker,
    transitionApplication,
    transitionTarget,
    updateSelected,
  };
}
