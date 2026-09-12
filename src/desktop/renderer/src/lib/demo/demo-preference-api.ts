import type { DesktopApi } from "@desktop/types";

export function createDemoPreferenceApi(): DesktopApi["preferences"] {
  return {
    list: async () => [],
    get: async () => null,
    resolve: async () => ({
      context: { ownerId: "preview-user", sessionId: "demo", turnId: "demo", actionId: "demo", taskScope: "global", targetFingerprint: null, domain: null },
      contextFingerprint: "demo", resolutionHash: "demo", applied: [], overridden: [], conflicts: [], ignored: [],
      explainabilitySnapshot: { version: 1, contextFingerprint: "demo", applied: [], overridden: [], conflicts: [], ignored: [] },
    }),
    prepareCreate: async () => { throw new Error("Demo 不支持 Preference 维护"); },
    prepareCreateFromSuggestion: async () => { throw new Error("Demo 不支持 Preference 维护"); },
    prepareUpdate: async () => { throw new Error("Demo 不支持 Preference 维护"); },
    prepareDisable: async () => { throw new Error("Demo 不支持 Preference 维护"); },
    prepareEnable: async () => { throw new Error("Demo 不支持 Preference 维护"); },
    prepareDelete: async () => { throw new Error("Demo 不支持 Preference 维护"); },
    prepareAcceptServer: async () => { throw new Error("Demo 不支持 Preference 恢复"); },
    prepareReapply: async () => { throw new Error("Demo 不支持 Preference 恢复"); },
    executeProposal: async () => { throw new Error("Demo 不支持 Preference 维护"); },
    suggestions: {
      list: async () => [],
      reject: async () => { throw new Error("Demo 不支持行为建议"); },
      clearSuppressed: async () => undefined,
    },
  };
}
