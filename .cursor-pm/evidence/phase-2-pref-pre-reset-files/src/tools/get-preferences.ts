import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type {
  PreferenceListFilterV1,
  PreferenceReaderV1,
} from "../preference/types.js";
import type { PreferenceSuggestionStore } from "../desktop/main/agent-task/preference-suggestion-store.js";

const parameters = Type.Object({
  kind: Type.Optional(Type.Union([
    Type.Literal("global"), Type.Literal("resume"), Type.Literal("job_search"),
    Type.Literal("browser_fill"), Type.Literal("interview"),
  ])),
  domain: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  targetFingerprint: Type.Optional(Type.String({ pattern: "^[0-9a-f]{64}$" })),
});

export function createGetPreferencesTool(
  reader: PreferenceReaderV1,
  usage?: PreferenceSuggestionStore,
): AgentTool<typeof parameters> {
  return {
    name: "get_preferences",
    label: "读取长期偏好",
    description: "读取当前账号已确认且仍有效的表达/决策习惯。Preference 不等同于 Profile 默认值、Experience 事实或 Answer Vault，不读取原始聊天内容。",
    parameters,
    execute: async (_toolCallId, params) => {
      const filter: PreferenceListFilterV1 = {
        ...(params.kind === undefined ? {} : { kind: params.kind }),
        ...(params.domain === undefined ? {} : { domain: params.domain }),
        ...(params.targetFingerprint === undefined ? {} : { targetFingerprint: params.targetFingerprint }),
      };
      const preferences = await reader.listPreferences(filter);
      const items = await Promise.all(preferences.map(async (preference) => ({
        ...preference,
        localUsage: usage ? await usage.usage(preference.id) : null,
      })));
      const result = { preferences: items, count: items.length };
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  };
}
