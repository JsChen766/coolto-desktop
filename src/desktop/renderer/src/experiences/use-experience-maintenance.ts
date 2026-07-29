import { onBeforeUnmount, onMounted, ref } from "vue";

import type {
  ExperienceDetail,
  ExperienceExecutionResult,
  ExperienceRevision,
  ExperienceSyncIssueView,
  ExperienceWriteProposal,
} from "@desktop/types";
import type { ExperienceProposalKind } from "../../../../experience/maintenance-types.js";
import { desktopApi } from "../lib/desktop-api";
import {
  draftFromExperience,
  emptyExperienceDraft,
  toExperienceCreateInput,
  toExperienceUpdateInput,
  type ExperienceFormDraft,
} from "./experience-form";

type EditorMode = "create" | "edit";
type DetailAction = "archive" | "restore" | "delete";
type SyncAction = "accept_server" | "reapply" | "save_as_new";

export function useExperienceMaintenance(
  onApplied: (
    result: ExperienceExecutionResult,
    kind: ExperienceProposalKind,
  ) => Promise<void>,
) {
  const editorMode = ref<EditorMode>();
  const editorExperienceId = ref<string>();
  const initialDraft = ref<ExperienceFormDraft>();
  const dirty = ref(false);
  const proposal = ref<ExperienceWriteProposal>();
  const syncIssue = ref<ExperienceSyncIssueView>();
  const unsavedOpen = ref(false);
  const busy = ref(false);
  const error = ref<string>();
  let leavePromise: Promise<boolean> | undefined;
  let resolveLeave: ((value: boolean) => void) | undefined;

  function startCreate(): void {
    editorMode.value = "create";
    editorExperienceId.value = undefined;
    initialDraft.value = emptyExperienceDraft();
    dirty.value = false;
    error.value = undefined;
  }

  function startEdit(experience: ExperienceDetail): void {
    editorMode.value = "edit";
    editorExperienceId.value = experience.id;
    initialDraft.value = draftFromExperience(experience);
    dirty.value = false;
    error.value = undefined;
  }

  function requiredEditorId(): string {
    if (!editorExperienceId.value) throw new Error("当前编辑经历不存在");
    return editorExperienceId.value;
  }

  async function review(draft: ExperienceFormDraft): Promise<void> {
    if (!editorMode.value) return;
    await run(async () => {
      proposal.value = editorMode.value === "create"
        ? await desktopApi.experiences.prepareCreate(toExperienceCreateInput(draft))
        : await desktopApi.experiences.prepareUpdate({
            experienceId: requiredEditorId(),
            changes: toExperienceUpdateInput(draft),
          });
    });
  }

  async function prepareAction(
    experienceId: string,
    action: DetailAction,
  ): Promise<void> {
    await run(async () => {
      proposal.value = action === "archive"
        ? await desktopApi.experiences.prepareArchive(experienceId)
        : action === "restore"
          ? await desktopApi.experiences.prepareRestore(experienceId)
          : await desktopApi.experiences.prepareDelete(experienceId);
    });
  }

  async function prepareRestoreRevision(
    experienceId: string,
    revision: ExperienceRevision,
  ): Promise<void> {
    await run(async () => {
      proposal.value = await desktopApi.experiences.prepareRestoreRevision({
        experienceId,
        revisionId: revision.id,
      });
    });
  }

  async function openSyncIssue(experienceId: string): Promise<void> {
    await run(async () => {
      syncIssue.value = await desktopApi.experiences.syncIssue(experienceId);
    });
  }

  async function prepareSyncAction(action: SyncAction): Promise<void> {
    const experienceId = syncIssue.value?.experienceId;
    if (!experienceId) return;
    await run(async () => {
      proposal.value = action === "accept_server"
        ? await desktopApi.experiences.prepareAcceptServer(experienceId)
        : action === "reapply"
          ? await desktopApi.experiences.prepareReapply(experienceId)
          : await desktopApi.experiences.prepareSaveAsNew(experienceId);
      syncIssue.value = undefined;
    });
  }

  async function executeProposal(): Promise<void> {
    const current = proposal.value;
    if (!current) return;
    await run(async () => {
      const result = await desktopApi.experiences.executeProposal(current.id);
      proposal.value = undefined;
      syncIssue.value = undefined;
      discardEditor();
      await onApplied(result, current.kind);
    });
  }

  async function requestCancelEditor(): Promise<void> {
    if (await confirmLeave()) discardEditor();
  }

  function discardEditor(): void {
    editorMode.value = undefined;
    editorExperienceId.value = undefined;
    initialDraft.value = undefined;
    dirty.value = false;
    error.value = undefined;
  }

  function confirmLeave(): Promise<boolean> {
    if (!editorMode.value || !dirty.value) return Promise.resolve(true);
    if (leavePromise) return leavePromise;
    unsavedOpen.value = true;
    leavePromise = new Promise<boolean>((resolve) => {
      resolveLeave = resolve;
    });
    return leavePromise;
  }

  function answerLeave(allow: boolean): void {
    unsavedOpen.value = false;
    resolveLeave?.(allow);
    resolveLeave = undefined;
    leavePromise = undefined;
  }

  function closeProposal(): void {
    proposal.value = undefined;
    error.value = undefined;
  }

  async function run(task: () => Promise<void>): Promise<void> {
    busy.value = true;
    error.value = undefined;
    try {
      await task();
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      busy.value = false;
    }
  }

  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!dirty.value) return;
    event.preventDefault();
    event.returnValue = "";
  }

  onMounted(() => window.addEventListener("beforeunload", beforeUnload));
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", beforeUnload);
    answerLeave(false);
  });

  return {
    answerLeave, busy, closeProposal, confirmLeave, dirty, discardEditor,
    editorMode, error, executeProposal, initialDraft, openSyncIssue, prepareAction,
    prepareRestoreRevision, prepareSyncAction, proposal, requestCancelEditor, review, startCreate,
    startEdit, syncIssue, unsavedOpen,
  };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "经历操作失败，请重试";
}
