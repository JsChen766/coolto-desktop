import type { IpcMain } from "electron";

import type { UserServices } from "../user-services.js";
import {
  childRequest, recoveryRequest, requiredId,
  validateInterviewInput, validateNoteInput, validateReminderInput,
} from "./tracker-ipc-validation.js";

export const TRACKER_CHILD_IPC_CHANNELS = [
  "tracker:detail",
  "tracker:overview",
  "tracker:sync-issues", "tracker:prepare-recovery", "tracker:execute-recovery",
  "tracker:retry-pending",
  "interviews:prepare-create", "interviews:prepare-update",
  "interviews:prepare-delete", "interviews:execute-proposal",
  "notes:prepare-create", "notes:prepare-update",
  "notes:prepare-delete", "notes:execute-proposal",
  "reminders:prepare-create", "reminders:prepare-update",
  "reminders:prepare-delete", "reminders:execute-proposal",
] as const;

const INTERVIEW_FIELDS = ["roundNumber", "interviewType", "scheduledAt", "timezone",
  "durationMinutes", "locationOrLink", "interviewer", "status"] as const;
const NOTE_FIELDS = ["interviewRoundId", "noteType", "content"] as const;
const REMINDER_FIELDS = ["interviewRoundId", "title", "remindAt", "status", "deliveredAt"] as const;

export function registerTrackerChildIpc(
  ipcMain: IpcMain,
  services: () => Promise<UserServices>,
): void {
  ipcMain.handle("tracker:detail", async (_event, id: unknown) =>
    (await services()).trackerDetail.get(requiredId(id, "applicationId")));
  ipcMain.handle("tracker:overview", async () => (await services()).trackerDetail.overview());
  ipcMain.handle("tracker:sync-issues", async () => (await services()).trackerRecovery.list());
  ipcMain.handle("tracker:prepare-recovery", async (_event, raw) => {
    const input = recoveryRequest(raw);
    return (await services()).trackerRecovery.prepare(input.entityType, input.entityId, input.action);
  });
  ipcMain.handle("tracker:execute-recovery", async (_event, id) =>
    (await services()).trackerRecovery.execute(requiredId(id, "proposalId")));
  ipcMain.handle("tracker:retry-pending", async () => (await services()).trackerRecovery.retryPending());
  registerInterviews(ipcMain, services);
  registerNotes(ipcMain, services);
  registerReminders(ipcMain, services);
}

function registerInterviews(ipc: IpcMain, services: () => Promise<UserServices>): void {
  ipc.handle("interviews:prepare-create", async (_event, raw) => {
    const input = childRequest(raw, INTERVIEW_FIELDS);
    const value = validateInterviewInput(input.value);
    return (await services()).interviewProposals.prepareCreate(
      requiredId(input.applicationId, "applicationId"), value);
  });
  ipc.handle("interviews:prepare-update", async (_event, raw) => {
    const input = childRequest(raw, INTERVIEW_FIELDS);
    const value = validateInterviewInput(input.value);
    return (await services()).interviewProposals.prepareUpdate(
      requiredId(input.id, "id"), value);
  });
  registerActions(ipc, services, "interviews", "interviewProposals");
}

function registerNotes(ipc: IpcMain, services: () => Promise<UserServices>): void {
  ipc.handle("notes:prepare-create", async (_event, raw) => {
    const input = childRequest(raw, NOTE_FIELDS);
    const value = validateNoteInput(input.value);
    return (await services()).noteProposals.prepareCreate(
      requiredId(input.applicationId, "applicationId"), value);
  });
  ipc.handle("notes:prepare-update", async (_event, raw) => {
    const input = childRequest(raw, NOTE_FIELDS);
    const value = validateNoteInput(input.value);
    return (await services()).noteProposals.prepareUpdate(requiredId(input.id, "id"), value);
  });
  registerActions(ipc, services, "notes", "noteProposals");
}

function registerReminders(ipc: IpcMain, services: () => Promise<UserServices>): void {
  ipc.handle("reminders:prepare-create", async (_event, raw) => {
    const input = childRequest(raw, REMINDER_FIELDS);
    const value = validateReminderInput(input.value);
    return (await services()).reminderProposals.prepareCreate(
      requiredId(input.applicationId, "applicationId"), value);
  });
  ipc.handle("reminders:prepare-update", async (_event, raw) => {
    const input = childRequest(raw, REMINDER_FIELDS);
    const value = validateReminderInput(input.value);
    return (await services()).reminderProposals.prepareUpdate(
      requiredId(input.id, "id"), value);
  });
  registerActions(ipc, services, "reminders", "reminderProposals");
}

function registerActions(
  ipc: IpcMain,
  services: () => Promise<UserServices>,
  channel: "interviews" | "notes" | "reminders",
  key: "interviewProposals" | "noteProposals" | "reminderProposals",
): void {
  ipc.handle(`${channel}:prepare-delete`, async (_event, id) =>
    (await services())[key].prepareDelete(requiredId(id, "id")));
  ipc.handle(`${channel}:execute-proposal`, async (_event, id) =>
    (await services())[key].execute(requiredId(id, "proposalId")));
}
