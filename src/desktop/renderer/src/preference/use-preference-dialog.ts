import { ref } from "vue";
import type {
  DesktopApi,
  PreferenceDesktopView,
  PreferenceResolutionV1,
  PreferenceSuggestionV1,
  PreferenceWriteProposalV1,
} from "@desktop/types";
import type { PreferenceMutationInputV1 } from "../../../../preference/types.js";
import {
  preferenceDraft,
  preferenceFormErrors,
  preferenceInput,
  type PreferenceFormDraft,
} from "./preference-form";

export function usePreferenceDialog(api: DesktopApi) {
  const items = ref<PreferenceDesktopView[]>([]);
  const suggestions = ref<PreferenceSuggestionV1[]>([]);
  const resolution = ref<PreferenceResolutionV1>();
  const draft = ref<PreferenceFormDraft>();
  const editingId = ref<string>();
  const proposal = ref<PreferenceWriteProposalV1>();
  const error = ref<string>();
  const notice = ref<string>();
  const busy = ref(false);

  async function load(): Promise<void> {
    await run(async () => {
      items.value = await api.preferences.list({ includeDisabled: true });
      suggestions.value = await api.preferences.suggestions.list();
    });
  }

  function beginCreate(): void {
    editingId.value = undefined; draft.value = preferenceDraft();
    proposal.value = undefined; error.value = undefined;
  }

  function beginEdit(item: PreferenceDesktopView): void {
    editingId.value = item.id; draft.value = preferenceDraft(item);
    proposal.value = undefined; error.value = undefined;
  }

  function cancelEdit(): void {
    draft.value = undefined; editingId.value = undefined;
    proposal.value = undefined; error.value = undefined;
  }

  async function prepare(): Promise<void> {
    if (!draft.value) return;
    const formErrors = preferenceFormErrors(draft.value);
    if (Object.keys(formErrors).length) { error.value = Object.values(formErrors)[0]; return; }
    await run(async () => {
      const input = preferenceInput(draft.value!);
      proposal.value = editingId.value
        ? await api.preferences.prepareUpdate(editingId.value, input)
        : await api.preferences.prepareCreate(input);
    });
  }

  async function prepareAction(id: string, action: "disable" | "enable" | "delete" | "accept-server" | "reapply"): Promise<void> {
    await run(async () => {
      proposal.value = action === "disable" ? await api.preferences.prepareDisable(id)
        : action === "enable" ? await api.preferences.prepareEnable(id)
          : action === "delete" ? await api.preferences.prepareDelete(id)
            : action === "accept-server" ? await api.preferences.prepareAcceptServer(id)
              : await api.preferences.prepareReapply(id);
    });
  }

  async function saveSuggestion(suggestion: PreferenceSuggestionV1): Promise<void> {
    await run(async () => {
      const input: PreferenceMutationInputV1 = {
        key: suggestion.key, value: suggestion.proposedValue, scope: suggestion.scope,
        priority: 50, source: "behavior_confirmed", sourceSuggestionHash: suggestion.patternHash,
      };
      proposal.value = await api.preferences.prepareCreateFromSuggestion(input, suggestion.id);
    });
  }

  async function confirm(): Promise<void> {
    if (!proposal.value) return;
    await run(async () => {
      await api.preferences.executeProposal(proposal.value!.id);
      notice.value = "已保存到本机，等待同步";
      cancelEdit();
      await load();
    });
  }

  async function explain(): Promise<void> {
    await run(async () => { resolution.value = await api.preferences.resolve({ taskScope: "global" }); });
  }

  async function rejectSuggestion(id: string): Promise<void> {
    await run(async () => {
      await api.preferences.suggestions.reject(id);
      suggestions.value = suggestions.value.filter((item) => item.id !== id);
    });
  }

  async function clearSuppressed(): Promise<void> {
    await run(async () => {
      await api.preferences.suggestions.clearSuppressed();
      suggestions.value = await api.preferences.suggestions.list();
      notice.value = "已清除本机忽略的建议";
    });
  }

  async function run(action: () => Promise<void>): Promise<void> {
    busy.value = true; error.value = undefined;
    try { await action(); } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "偏好操作失败";
    } finally { busy.value = false; }
  }

  return {
    items, suggestions, resolution, draft, editingId, proposal, error, notice, busy,
    load, beginCreate, beginEdit, cancelEdit, prepare, prepareAction, saveSuggestion,
    confirm, explain, rejectSuggestion, clearSuppressed,
  };
}
