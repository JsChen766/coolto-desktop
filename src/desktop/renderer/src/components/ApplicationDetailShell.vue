<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ApplicationNote, ApplicationRecord, ApplicationReferenceOptions, ApplicationStatus, ApplicationUpdateInput, InterviewRound, Reminder, TrackerChildKind } from "@desktop/types";
import { useApplicationTrackerDetail } from "../tracker/use-application-tracker-detail";
import ApplicationDetailPanel from "./ApplicationDetailPanel.vue";
import InterviewEditorDialog from "./InterviewEditorDialog.vue";
import NoteEditorDialog from "./NoteEditorDialog.vue";
import ReminderEditorDialog from "./ReminderEditorDialog.vue";
import TrackerChildProposalDialog from "./TrackerChildProposalDialog.vue";

const props = defineProps<{ application: ApplicationRecord; references: ApplicationReferenceOptions; busy?: boolean; error?: string | undefined }>();
const emit = defineEmits<{ close: []; update: [changes: ApplicationUpdateInput]; transition: [status: ApplicationStatus]; delete: []; openUrl: [url: string]; openAsset: [kind: "jd" | "resume", id: string]; childrenChanged: [] }>();
const tracker = useApplicationTrackerDetail();
const editor = ref<"interview" | "note" | "reminder">();
const interview = ref<InterviewRound>();
const note = ref<ApplicationNote>();
const reminder = ref<Reminder>();
const nextRound = computed(() => Math.max(0, ...tracker.detail.value.interviews.map((item) => item.roundNumber)) + 1);

watch(() => props.application.id, (id) => void tracker.load(id), { immediate: true });
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
</script>

<template>
  <ApplicationDetailPanel :application="application" :references="references" :detail="tracker.detail.value" :detail-loading="tracker.loading.value" :busy="busy || tracker.busy.value" :error="error || tracker.error.value" @close="$emit('close')" @update="$emit('update', $event)" @transition="$emit('transition', $event)" @delete="$emit('delete')" @open-url="$emit('openUrl', $event)" @open-asset="(kind, id) => $emit('openAsset', kind, id)" @add-interview="open('interview')" @edit-interview="open('interview', $event)" @add-note="open('note')" @edit-note="open('note', $event)" @add-reminder="open('reminder')" @edit-reminder="open('reminder', $event)" @remove-child="remove" />
  <InterviewEditorDialog v-if="editor === 'interview'" :interview="interview" :next-round="nextRound" :busy="tracker.busy.value" :error="tracker.error.value" @close="closeEditor" @review="reviewInterview" />
  <NoteEditorDialog v-if="editor === 'note'" :note="note" :interviews="tracker.detail.value.interviews" :busy="tracker.busy.value" :error="tracker.error.value" @close="closeEditor" @review="reviewNote" />
  <ReminderEditorDialog v-if="editor === 'reminder'" :reminder="reminder" :interviews="tracker.detail.value.interviews" :busy="tracker.busy.value" :error="tracker.error.value" @close="closeEditor" @review="reviewReminder" />
  <TrackerChildProposalDialog v-if="tracker.proposal.value" :proposal="tracker.proposal.value" :busy="tracker.busy.value" :error="tracker.error.value" @close="tracker.proposal.value = undefined" @confirm="execute" />
</template>
