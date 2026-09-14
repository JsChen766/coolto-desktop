import type { IpcMain } from "electron";

import { resolvePreferences } from "../../../preference/resolution.js";
import type { PreferenceResolutionV1 } from "../../../preference/types.js";
import type { PreferenceSignalReader } from "../agent-task/preference-signal-reader.js";
import type { PreferenceSuggestionStore } from "../agent-task/preference-suggestion-store.js";
import { PreferenceProposalService } from "./preference-proposal-service.js";
import { PreferenceSyncStore } from "./preference-sync-store.js";
import {
  createMutationInput,
  listFilter,
  mutationInput,
  preferenceId,
  proposalId,
  resolveInput,
  suggestionId,
  type PreferenceResolveRequest,
} from "./preference-ipc-validation.js";

export const PREFERENCE_IPC_CHANNELS = [
  "preferences:list", "preferences:get", "preferences:resolve",
  "preferences:prepare-create", "preferences:prepare-update",
  "preferences:prepare-create-from-suggestion",
  "preferences:prepare-disable", "preferences:prepare-enable",
  "preferences:prepare-delete", "preferences:prepare-accept-server",
  "preferences:prepare-reapply", "preferences:execute-proposal",
  "preferences:suggestions:list", "preferences:suggestions:reject",
  "preferences:suggestions:clear-suppressed",
] as const;

export function registerPreferenceIpc(
  ipc: IpcMain,
  stores: () => Promise<PreferenceSyncStore>,
  proposals: () => Promise<PreferenceProposalService>,
  suggestions: () => Promise<PreferenceSuggestionStore>,
  signalReader?: PreferenceSignalReader,
): void {
  ipc.handle("preferences:list", async (_event, input) => {
    const store = await stores();
    return store.listViews(listFilter(input), await suggestions());
  });
  ipc.handle("preferences:get", async (_event, id) => {
    const store = await stores();
    return store.getPreferenceView(preferenceId(id), await suggestions());
  });
  ipc.handle("preferences:resolve", async (_event, input) =>
    resolveCurrent(await stores(), await suggestions(), resolveInput(input)));
  ipc.handle("preferences:prepare-create", async (_event, input) =>
    (await proposals()).prepareCreate(createMutationInput(input)));
  ipc.handle("preferences:prepare-create-from-suggestion", async (_event, input, id) =>
    (await proposals()).prepareCreateFromSuggestion(createMutationInput(input), suggestionId(id)));
  ipc.handle("preferences:prepare-update", async (_event, id, input) =>
    (await proposals()).prepareUpdate(preferenceId(id), mutationInput(input, true)));
  ipc.handle("preferences:prepare-disable", async (_event, id) =>
    (await proposals()).prepareDisable(preferenceId(id)));
  ipc.handle("preferences:prepare-enable", async (_event, id) =>
    (await proposals()).prepareEnable(preferenceId(id)));
  ipc.handle("preferences:prepare-delete", async (_event, id) =>
    (await proposals()).prepareDelete(preferenceId(id)));
  ipc.handle("preferences:prepare-accept-server", async (_event, id) =>
    (await proposals()).prepareAcceptServer(preferenceId(id)));
  ipc.handle("preferences:prepare-reapply", async (_event, id) =>
    (await proposals()).prepareReapply(preferenceId(id)));
  ipc.handle("preferences:execute-proposal", async (_event, id) =>
    (await proposals()).execute(proposalId(id)));
  ipc.handle("preferences:suggestions:list", async () => {
    const suggestionStore = await suggestions();
    await suggestionStore.reconcileAccepted(await stores());
    if (!signalReader) return [];
    const now = new Date();
    return suggestionStore.refresh(signalReader,
      new Date(now.getTime() - 30 * 86_400_000).toISOString(), now.toISOString(), now.toISOString());
  });
  ipc.handle("preferences:suggestions:reject", async (_event, id) => {
    if (!signalReader) throw new Error("行为建议来源尚未启用");
    return (await suggestions()).reject(suggestionId(id), signalReader.evidenceResolver());
  });
  ipc.handle("preferences:suggestions:clear-suppressed", async () =>
    (await suggestions()).clearSuppressions());
}

async function resolveCurrent(
  store: PreferenceSyncStore,
  usage: PreferenceSuggestionStore,
  input: PreferenceResolveRequest,
): Promise<PreferenceResolutionV1> {
  const resolution = resolvePreferences({
    preferences: await store.listPreferences(),
    context: {
      ownerId: store.ownerId, sessionId: input.sessionId ?? "settings",
      turnId: input.turnId ?? "settings", actionId: input.actionId ?? "settings",
      taskScope: input.taskScope ?? "global", targetFingerprint: input.targetFingerprint ?? null,
      domain: input.domain ?? null,
    },
    ...(input.currentOverrides ? { currentOverrides: input.currentOverrides } : {}),
    now: new Date().toISOString(),
  });
  await Promise.all(resolution.applied
    .filter((entry) => !entry.preferenceId.startsWith("current-turn:"))
    .map((entry) => usage.recordUse(entry.preferenceId)));
  return resolution;
}
