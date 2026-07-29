import { computed, watch } from "vue";

import type { ExperienceExecutionResult } from "@desktop/types";
import type { ExperienceRevision } from "@desktop/types";
import type { ExperienceProposalKind } from "../../../../experience/maintenance-types";
import { useExperienceLibrary } from "./use-experience-library";
import { useExperienceMaintenance } from "./use-experience-maintenance";
import type { ExperienceImportFocus } from "./experience-import-focus";

export function useExperienceLibraryController(
  importFocus: () => ExperienceImportFocus | undefined,
  onClearImportFocus: () => void,
) {
  const page = useExperienceLibrary();
  const maintenance = useExperienceMaintenance(applied);
  const focusPosition = computed(() => {
    const index = page.focusedIds.value.indexOf(page.selectedId.value ?? "");
    return index < 0 ? 0 : index + 1;
  });

  async function applied(
    result: ExperienceExecutionResult,
    kind: ExperienceProposalKind,
  ): Promise<void> {
    const experience = result.experience;
    if (experience && (kind === "create" || kind === "save_as_new")) {
      page.status.value = experience.status;
    }
    if (!experience) {
      page.selectedId.value = undefined;
      page.selected.value = undefined;
    }
    await page.load(experience?.id);
    if (experience && page.status.value === experience.status) {
      await page.select(experience.id);
    } else {
      page.detailOpen.value = false;
    }
  }

  async function leaveEditor(action: () => void | Promise<void>): Promise<void> {
    if (!(await maintenance.confirmLeave())) return;
    maintenance.discardEditor();
    await action();
  }

  function newExperience(): void {
    if (!maintenance.editorMode.value) {
      maintenance.startCreate();
      page.detailOpen.value = true;
      return;
    }
    void leaveEditor(() => {
      maintenance.startCreate();
      page.detailOpen.value = true;
    });
  }

  function clearImportFocus(): void {
    if (!page.focusActive.value) return;
    page.clearImportedFocus();
    onClearImportFocus();
  }

  function editExperience(): void {
    if (!page.selected.value) return;
    clearImportFocus();
    maintenance.startEdit(page.selected.value);
  }

  function updateFilter(action: () => void): void {
    void leaveEditor(() => {
      clearImportFocus();
      action();
    });
  }

  function selectExperience(experienceId: string): void {
    void leaveEditor(async () => {
      if (
        page.focusActive.value
        && !page.focusedIds.value.includes(experienceId)
      ) clearImportFocus();
      await page.select(experienceId);
    });
  }

  function prepareDetailAction(
    action: "archive" | "restore" | "delete",
  ): void {
    const experienceId = page.selected.value?.id;
    if (!experienceId) return;
    clearImportFocus();
    void maintenance.prepareAction(experienceId, action);
  }

  function restoreRevision(revision: ExperienceRevision): void {
    const experienceId = page.selected.value?.id;
    if (!experienceId) return;
    clearImportFocus();
    void maintenance.prepareRestoreRevision(experienceId, revision);
  }

  async function refresh(): Promise<void> {
    await leaveEditor(async () => {
      await page.load();
      const focus = importFocus();
      if (focus) await page.focusImportedExperiences(focus.experienceIds);
    });
  }

  watch(importFocus, (focus) => {
    if (focus) void page.focusImportedExperiences(focus.experienceIds);
    else if (page.focusActive.value) page.clearImportedFocus();
  }, { immediate: true });

  return {
    clearImportFocus, editExperience, focusPosition, leaveEditor, maintenance,
    newExperience, page, prepareDetailAction, refresh, restoreRevision, selectExperience,
    updateFilter,
  };
}
