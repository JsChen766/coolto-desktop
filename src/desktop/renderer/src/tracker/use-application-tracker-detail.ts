import { ref } from "vue";

import type {
  ApplicationTrackerDetail,
  InterviewInput,
  NoteInput,
  ReminderInput,
  TrackerChildKind,
  TrackerChildProposal,
} from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";

export function useApplicationTrackerDetail() {
  const detail = ref<ApplicationTrackerDetail>(emptyDetail());
  const loading = ref(false);
  const busy = ref(false);
  const error = ref<string>();
  const proposal = ref<TrackerChildProposal>();
  let applicationId: string | undefined;

  async function load(id: string): Promise<void> {
    applicationId = id;
    loading.value = true;
    error.value = undefined;
    try {
      detail.value = await desktopApi.tracker.detail(id);
    } catch (cause) {
      error.value = messageOf(cause, "读取投递日程失败");
    } finally {
      loading.value = false;
    }
  }

  async function reviewInterview(id: string | undefined, value: InterviewInput) {
    await review(() => id
      ? desktopApi.interviews.prepareUpdate({ id, value })
      : desktopApi.interviews.prepareCreate({ applicationId: requiredApplication(), value }));
  }

  async function reviewNote(id: string | undefined, value: NoteInput) {
    await review(() => id
      ? desktopApi.notes.prepareUpdate({ id, value })
      : desktopApi.notes.prepareCreate({ applicationId: requiredApplication(), value }));
  }

  async function reviewReminder(id: string | undefined, value: ReminderInput) {
    if (value.status === "scheduled") await requestNotificationPermission();
    await review(() => id
      ? desktopApi.reminders.prepareUpdate({ id, value })
      : desktopApi.reminders.prepareCreate({ applicationId: requiredApplication(), value }));
  }

  async function reviewDelete(kind: TrackerChildKind, id: string): Promise<void> {
    await review(() => childApi(kind).prepareDelete(id));
  }

  async function execute(): Promise<void> {
    const current = proposal.value;
    if (!current) return;
    await run(async () => {
      await childApi(current.entityKind).executeProposal(current.id);
      proposal.value = undefined;
      await load(requiredApplication());
    });
  }

  async function review(task: () => Promise<TrackerChildProposal>): Promise<void> {
    await run(async () => { proposal.value = await task(); });
  }

  async function run(task: () => Promise<void>): Promise<void> {
    busy.value = true;
    error.value = undefined;
    try { await task(); } catch (cause) { error.value = messageOf(cause, "Tracker 操作失败"); }
    finally { busy.value = false; }
  }

  function requiredApplication(): string {
    if (!applicationId) throw new Error("当前投递记录不存在");
    return applicationId;
  }

  return {
    busy, detail, error, execute, load, loading, proposal,
    reviewDelete, reviewInterview, reviewNote, reviewReminder,
  };
}

async function requestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  await Notification.requestPermission().catch(() => "denied");
}

function childApi(kind: TrackerChildKind) {
  return kind === "interview" ? desktopApi.interviews
    : kind === "note" ? desktopApi.notes : desktopApi.reminders;
}

function emptyDetail(): ApplicationTrackerDetail {
  return { statusEvents: [], interviews: [], notes: [], reminders: [] };
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
