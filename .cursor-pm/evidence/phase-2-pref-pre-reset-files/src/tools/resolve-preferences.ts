import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { resolvePreferences } from "../preference/resolution.js";
import type {
  PreferenceReaderV1,
  PreferenceScopeV1,
  PreferenceTurnOverrideV1,
} from "../preference/types.js";
import type { PreferenceSuggestionStore } from "../desktop/main/agent-task/preference-suggestion-store.js";

const scopeSchema = Type.Object({
  kind: Type.Union([
    Type.Literal("global"), Type.Literal("resume"), Type.Literal("job_search"),
    Type.Literal("browser_fill"), Type.Literal("interview"),
  ]),
  domain: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  targetFingerprint: Type.Optional(Type.String({ pattern: "^[0-9a-f]{64}$" })),
});
const overrideSchema = Type.Object({
  key: Type.String(), value: Type.Union([Type.String(), Type.Array(Type.String())]),
  scope: Type.Optional(scopeSchema), reason: Type.Optional(Type.String()),
});
const parameters = Type.Object({
  taskScope: Type.Optional(Type.String()),
  targetFingerprint: Type.Optional(Type.String({ pattern: "^[0-9a-f]{64}$" })),
  domain: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  currentOverrides: Type.Optional(Type.Array(overrideSchema, { maxItems: 20 })),
});

export function createResolvePreferencesTool(
  ownerId: string,
  sessionId: string,
  reader: PreferenceReaderV1,
  usage?: PreferenceSuggestionStore,
): AgentTool<typeof parameters> {
  return {
    name: "resolve_preferences",
    label: "解释当前偏好",
    description: "按当前任务范围解析已确认 Preference，并说明应用、覆盖、冲突和忽略原因。当前用户消息只作为临时覆盖，不会自动保存。",
    parameters,
    execute: async (toolCallId, params) => {
      const taskScope = (params.taskScope ?? "global") as PreferenceScopeV1["kind"];
      const preferences = await reader.listPreferences();
      const currentOverrides = (params.currentOverrides ?? []) as PreferenceTurnOverrideV1[];
      const resolution = resolvePreferences({
        preferences,
        context: {
          ownerId, sessionId, turnId: toolCallId, actionId: toolCallId,
          taskScope, targetFingerprint: params.targetFingerprint ?? null,
          domain: params.domain ?? null,
        },
        currentOverrides, now: new Date().toISOString(),
      });
      if (usage) {
        await Promise.all(resolution.applied
          .filter((entry) => !entry.preferenceId.startsWith("current-turn:"))
          .map((entry) => usage.recordUse(entry.preferenceId)));
      }
      return { content: [{ type: "text", text: JSON.stringify(resolution) }], details: resolution };
    },
  };
}
