import type {
  DesktopApi,
  PreferenceDesktopView,
  PreferenceWriteProposalV1,
  ProfileChangeSet,
  ProfileContactView,
  ProfileWriteProposal,
} from "@desktop/types";
import type {
  PreferenceMutationInputV1,
  PreferenceResolutionV1,
  PreferenceV1,
} from "../../../../preference/types.js";
import type { PreferenceSuggestionV1 } from "@desktop/types";
import { loadQaState, preferenceView, saveQaState, type QaPersistedState } from "./qa-store.js";

const ownerId = "00000000-0000-4000-8000-000000000001";
const now = () => new Date().toISOString();

export function createPhase2QaApi(): DesktopApi {
  const state: QaPersistedState = loadQaState();
  const profileProposals = new Map<string, ProfileWriteProposal>();
  const preferenceProposals = new Map<string, PreferenceWriteProposalV1>();

  function persist(): void { saveQaState(state); }

  function mergeProfile(changes: ProfileChangeSet): ProfileContactView {
    return {
      ...state.profile, ...changes, updatedAt: now(),
      entityVersion: (state.profile.entityVersion ?? 1) + 1,
    };
  }

  function addPreferenceProposal(
    action: PreferenceWriteProposalV1["action"],
    current: PreferenceV1 | null,
    next: PreferenceV1 | null,
  ): PreferenceWriteProposalV1 {
    const proposal: PreferenceWriteProposalV1 = {
      id: crypto.randomUUID(), action, ownerId,
      preferenceId: current?.id ?? next?.id ?? null,
      current, next, expectedEntityVersion: current ? 1 : null,
      localVersion: 0, preparedAt: now(), explanation: "QA 偏好变更",
    };
    preferenceProposals.set(proposal.id, proposal);
    return proposal;
  }

  const api = {
    profile: {
      get: async () => structuredClone(state.profile),
      prepareUpdate: async (changes: ProfileChangeSet) => {
        const proposal: ProfileWriteProposal = {
          id: crypto.randomUUID(), kind: "manual",
          current: structuredClone(state.profile) as ProfileWriteProposal["current"],
          next: mergeProfile(changes) as ProfileWriteProposal["next"],
          syncStatus: state.profile.syncStatus, preparedAt: now(),
        };
        profileProposals.set(proposal.id, proposal);
        return proposal;
      },
      prepareReapply: async (changes: ProfileChangeSet) => api.profile.prepareUpdate(changes),
      prepareAcceptServer: async () => ({
        id: crypto.randomUUID(), kind: "accept_server",
        current: structuredClone(state.profile) as ProfileWriteProposal["current"],
        next: null, syncStatus: "conflict", preparedAt: now(),
      }),
      executeProposal: async (id: string) => {
        const proposal = profileProposals.get(id);
        if (!proposal?.next) throw new Error("missing profile proposal");
        state.profile = { ...proposal.next, syncStatus: "pending" } as ProfileContactView;
        persist();
        profileProposals.delete(id);
        return structuredClone(proposal.next);
      },
    },
    preferences: {
      list: async () => structuredClone(state.preferences),
      get: async (id: string) => state.preferences.find((item) => item.id === id) ?? null,
      prepareCreate: async (input: PreferenceMutationInputV1) => {
        const next = preferenceView(input, crypto.randomUUID());
        return addPreferenceProposal("create", null, next);
      },
      prepareCreateFromSuggestion: async (input: PreferenceMutationInputV1, suggestionId: string) => {
        state.rejectedSuggestions.push(suggestionId);
        persist();
        const next = preferenceView(input, crypto.randomUUID());
        return addPreferenceProposal("create", null, next);
      },
      prepareUpdate: async (id: string, input: Partial<PreferenceMutationInputV1>) => {
        const current = state.preferences.find((item) => item.id === id);
        if (!current) throw new Error("preference missing");
        const next: PreferenceV1 = {
          ...current, ...input, value: input.value ?? current.value, updatedAt: now(),
        };
        return addPreferenceProposal("update", current, next);
      },
      prepareDisable: async (id: string) => {
        const current = state.preferences.find((item) => item.id === id);
        if (!current) throw new Error("preference missing");
        return addPreferenceProposal("update", current, { ...current, status: "disabled", updatedAt: now() });
      },
      prepareEnable: async (id: string) => api.preferences.prepareUpdate(id, {}),
      prepareDelete: async (id: string) => {
        const current = state.preferences.find((item) => item.id === id);
        if (!current) throw new Error("preference missing");
        return addPreferenceProposal("delete", current, null);
      },
      prepareAcceptServer: async (id: string) => addPreferenceProposal("accept_server", state.preferences.find((i) => i.id === id) ?? null, null),
      prepareReapply: async (id: string) => addPreferenceProposal("reapply", state.preferences.find((i) => i.id === id) ?? null, state.preferences.find((i) => i.id === id) ?? null),
      executeProposal: async (id: string) => {
        const proposal = preferenceProposals.get(id);
        if (!proposal) throw new Error("missing preference proposal");
        if (proposal.action === "delete" && proposal.preferenceId) {
          state.preferences = state.preferences.filter((item) => item.id !== proposal.preferenceId);
        } else if (proposal.next) {
          const view = { ...proposal.next, syncStatus: "pending" as const, localUsage: { useCount: 0, lastUsedAt: null } };
          const index = state.preferences.findIndex((item) => item.id === view.id);
          if (index >= 0) state.preferences[index] = view;
          else state.preferences.push(view);
        }
        persist();
        preferenceProposals.delete(id);
        return proposal.next;
      },
      resolve: async (): Promise<PreferenceResolutionV1> => ({
        context: {
          ownerId, sessionId: "s-qa", turnId: "t-qa", actionId: "a-qa",
          taskScope: "global", targetFingerprint: null, domain: null,
        },
        contextFingerprint: "qa-context",
        resolutionHash: "qa-resolution",
        applied: [], overridden: [], conflicts: [], ignored: [],
        explainabilitySnapshot: {
          version: 1, contextFingerprint: "qa-context",
          applied: [], overridden: [], conflicts: [], ignored: [],
        },
      }),
      suggestions: {
        list: async (): Promise<PreferenceSuggestionV1[]> => {
          const item: PreferenceSuggestionV1 = {
            version: 1, id: "suggestion-qa", ownerId, sessionId: "s-qa", turnId: "t-qa", actionId: "a-qa",
            eventIds: [], patternHash: "hash-qa", key: "resume.tone", proposedValue: "restrained",
            scope: { kind: "global" }, conflictGroup: "resume.tone", observationCount: 2,
            observationActionCount: 2, observationWindow: { from: now(), to: now() },
            confidence: "strong", rationale: { code: "repeated_selection_pattern", referenceHashes: [] },
            state: "pending", createdAt: now(), lastPresentedAt: null,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(), ruleVersion: "qa",
          };
          return state.rejectedSuggestions.includes(item.id) ? [] : [item];
        },
        reject: async (id: string) => { state.rejectedSuggestions.push(id); persist(); },
        clearSuppressed: async () => { state.rejectedSuggestions = []; persist(); },
      },
    },
    shell: { openExternal: async () => undefined },
    mailConnections: {
      providers: async () => [],
      list: async () => [],
      connect: async () => { throw new Error("qa"); },
      disconnect: async () => undefined,
    },
    calendar: { status: async () => ({ supported: false, permission: "denied" as const }) },
  } as unknown as DesktopApi;

  return api;
}
