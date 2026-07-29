import type { IpcMain } from "electron";

import type { ExperienceSyncStore } from "./experience-sync-store.js";
import type { ExperienceProposalService } from "./experience-proposal-service.js";
import {
  parseExperienceId,
  parseExperienceSearch,
  parseExperienceUpdate,
  parseProposalId,
} from "./experience-ipc-validation.js";

export const EXPERIENCE_IPC_CHANNELS = [
  "experiences:search",
  "experiences:get",
  "experiences:prepare-update",
  "experiences:prepare-archive",
  "experiences:prepare-restore",
  "experiences:prepare-delete",
  "experiences:sync-issue",
  "experiences:prepare-accept-server",
  "experiences:prepare-reapply",
  "experiences:prepare-save-as-new",
  "experiences:execute-proposal",
] as const;

export function registerExperienceIpc(
  ipcMain: IpcMain,
  getStore: () => Promise<ExperienceSyncStore>,
  getProposals: () => Promise<ExperienceProposalService>,
): void {
  ipcMain.handle("experiences:search", async (_event, options: unknown) =>
    (await getStore()).searchExperiences(parseExperienceSearch(options)));
  ipcMain.handle("experiences:get", async (_event, id: unknown) =>
    (await getStore()).getExperience(parseExperienceId(id)));
  ipcMain.handle("experiences:prepare-update", async (_event, value: unknown) => {
    const input = parseExperienceUpdate(value);
    return (await getProposals()).prepareUpdate(input.experienceId, input.changes);
  });
  for (const [channel, method] of [
    ["experiences:prepare-archive", "prepareArchive"],
    ["experiences:prepare-restore", "prepareRestore"],
    ["experiences:prepare-delete", "prepareDelete"],
    ["experiences:prepare-accept-server", "prepareAcceptServer"],
    ["experiences:prepare-reapply", "prepareReapply"],
    ["experiences:prepare-save-as-new", "prepareSaveAsNew"],
  ] as const) {
    ipcMain.handle(channel, async (_event, id: unknown) =>
      (await getProposals())[method](parseExperienceId(id)));
  }
  ipcMain.handle("experiences:sync-issue", async (_event, id: unknown) =>
    (await getProposals()).getSyncIssue(parseExperienceId(id)));
  ipcMain.handle("experiences:execute-proposal", async (_event, id: unknown) =>
    (await getProposals()).execute(parseProposalId(id)));
}
