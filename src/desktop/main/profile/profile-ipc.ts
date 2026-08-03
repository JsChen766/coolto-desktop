import type { IpcMain } from "electron";

import type { ProfileProposalService } from "./profile-proposal-service.js";
import type { ProfileSyncStore } from "./profile-sync-store.js";
import { profileChanges, proposalId } from "./profile-ipc-validation.js";

export const PROFILE_IPC_CHANNELS = [
  "profile:get", "profile:prepare-update", "profile:prepare-reapply",
  "profile:prepare-accept-server", "profile:execute-proposal",
] as const;

export function registerProfileIpc(
  ipc: IpcMain,
  stores: () => Promise<ProfileSyncStore>,
  proposals: () => Promise<ProfileProposalService>,
): void {
  ipc.handle("profile:get", async () => (await stores()).getProfileView());
  ipc.handle("profile:prepare-update", async (_event, value) =>
    (await proposals()).prepareUpdate(profileChanges(value)));
  ipc.handle("profile:prepare-reapply", async (_event, value) =>
    (await proposals()).prepareReapply(profileChanges(value)));
  ipc.handle("profile:prepare-accept-server", async () =>
    (await proposals()).prepareAcceptServer());
  ipc.handle("profile:execute-proposal", async (_event, id) =>
    (await proposals()).execute(proposalId(id)));
}
