<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import type { ApplicationNote, ApplicationRecord, ApplicationReferenceOptions, ApplicationStatus, ApplicationUpdateInput, InterviewRound, Reminder, SubmissionReceiptView, TrackerChildKind } from "@desktop/types";
import { useApplicationTrackerDetail } from "../tracker/use-application-tracker-detail";
import ApplicationDetailPanel from "./ApplicationDetailPanel.vue";
import InterviewEditorDialog from "./InterviewEditorDialog.vue";
import NoteEditorDialog from "./NoteEditorDialog.vue";
import ReminderEditorDialog from "./ReminderEditorDialog.vue";
import TrackerChildProposalDialog from "./TrackerChildProposalDialog.vue";
import { desktopApi } from "../lib/desktop-api";

const props = defineProps<{ application: ApplicationRecord; references: ApplicationReferenceOptions; busy?: boolean; error?: string | undefined; focusInterviewId?: string | undefined; loopsEnabled?: boolean }>();
const emit = defineEmits<{ close: []; update: [changes: ApplicationUpdateInput]; transition: [status: ApplicationStatus]; delete: []; openUrl: [url: string]; openAsset: [kind: "jd" | "resume", id: string]; childrenChanged: []; startLoop: [kind: "follow_up" | "briefing", interviews: InterviewRound[]]; prepareInterview: [] }>();
const tracker = useApplicationTrackerDetail();
const editor = ref<"interview" | "note" | "reminder">();
const interview = ref<InterviewRound>();
const note = ref<ApplicationNote>();
const reminder = ref<Reminder>();
const submissionReceipt = ref<SubmissionReceiptView>();
const calendarSupported = shallowRef(false);
const calendarBusyId = shallowRef<string>();
const calendarMessage = shallowRef<string>();
const nextRound = computed(() => Math.max(0, ...tracker.detail.value.interviews.map((item) => item.roundNumber)) + 1);

watch(() => props.application.id, (id) => {
  calendarMessage.value = undefined;
  void tracker.load(id);
  void desktopApi.agentTasks.submissionReceipt(id)
    .then((value) => { submissionReceipt.value = value; })
    .catch(() => { submissionReceipt.value = undefined; });
  void desktopApi.calendar.status().then((value) => {
    calendarSupported.value = value.supported;
  }).catch(() => { calendarSupported.value = false; });
}, { immediate: true });
function open(kind: typeof editor.value, value?: InterviewRound | ApplicationNote | Reminder): void {
  editor.value = kind;
  interview.value = kind === "interview" ? value as InterviewRound | undefined : undefined;
  note.value = kind === "note" ? value as ApplicationNote | undefined : undefined;
  reminder.value = kind === "reminder" ? value as Reminder | undefined : undefined;
}
function closeEditor(): void { editor.value = undefined; }
async function remove(kind: TrackerChildKind, id: string): Promise<void> { await tracker.reviewDelete(kind, id); }
async function reviewInterview(value: Parameters<typeof tracker.reviewInterview>[1]): Promise<void> {
  await tracker.reviewInterview(interview.value?.id, value);
  if (tracker.proposal.value) closeEditor();
}
async function reviewNote(value: Parameters<typeof tracker.reviewNote>[1]): Promise<void> {
  await tracker.reviewNote(note.value?.id, value);
  if (tracker.proposal.value) closeEditor();
}
async function reviewReminder(value: Parameters<typeof tracker.reviewReminder>[1]): Promise<void> {
  await tracker.reviewReminder(reminder.value?.id, value);
  if (tracker.proposal.value) closeEditor();
}
async function execute(): Promise<void> {
  await tracker.execute();
  emit("childrenChanged");
}
async function syncInterview(value: InterviewRound): Promise<void> {
  calendarBusyId.value = value.id;
  calendarMessage.value = undefined;
  try {
    let result = await desktopApi.calendar.syncInterview({
      applicationId: props.application.id, interviewId: value.id,
    });
    if (result.outcome === "permission_required" && result.requiredAccess) {
      await desktopApi.calendar.requestAccess(result.requiredAccess);
      result = await desktopApi.calendar.syncInterview({
        applicationId: props.application.id, interviewId: value.id,
      });
    }
    calendarMessage.value = result.message;
  } catch (cause) {
    calendarMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally { calendarBusyId.value = undefined; }
}
</script>

<template>
  <ApplicationDetailPanel :application="application" :references="references" :detail="tracker.detail.value" :detail-loading="tracker.loading.value" :submission-receipt="submissionReceipt" :focus-interview-id="focusInterviewId" :calendar-supported="calendarSupported" :calendar-busy-id="calendarBusyId" :calendar-message="calendarMessage" :loops-enabled="loopsEnabled" :busy="busy || tracker.busy.value" :error="error || tracker.error.value" @close="$emit('close')" @update="$emit('update', $event)" @transition="$emit('transition', $event)" @delete="$emit('delete')" @open-url="$emit('openUrl', $event)" @open-asset="(kind, id) => $emit('openAsset', kind, id)" @start-loop="$emit('startLoop', $event, tracker.detail.value.interviews)" @prepare-interview="$emit('prepareInterview')" @add-interview="open('interview')" @edit-interview="open('interview', $event)" @sync-interview="syncInterview" @add-note="open('note')" @edit-note="open('note', $event)" @add-reminder="open('reminder')" @edit-reminder="open('reminder', $event)" @remove-child="remove" />
  <InterviewEditorDialog v-if="editor === 'interview'" :interview="interview" :next-round="nextRound" :busy="tracker.busy.value" :error="tracker.error.value" @close="closeEditor" @review="reviewInterview" />
  <NoteEditorDialog v-if="editor === 'note'" :note="note" :interviews="tracker.detail.value.interviews" :busy="tracker.busy.value" :error="tracker.error.value" @close="closeEditor" @review="reviewNote" />
  <ReminderEditorDialog v-if="editor === 'reminder'" :reminder="reminder" :interviews="tracker.detail.value.interviews" :busy="tracker.busy.value" :error="tracker.error.value" @close="closeEditor" @review="reviewReminder" />
  <TrackerChildProposalDialog v-if="tracker.proposal.value" :proposal="tracker.proposal.value" :busy="tracker.busy.value" :error="tracker.error.value" @close="tracker.proposal.value = undefined" @confirm="execute" />
</template>
