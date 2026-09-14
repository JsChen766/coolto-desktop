import { ref } from "vue";

import type {
  DesktopApi,
  ProfileContactView,
  ProfileWriteProposal,
} from "../../../shared/types.js";
import type { ProfileTargetDraft, ProfileFormDraft } from "./profile-form.js";
import { cloneProfileDraft, profileChanges, profileDraft } from "./profile-form.js";

export function useProfileDialog(api: DesktopApi) {
  const profile = ref<ProfileContactView>();
  const draft = ref<ProfileFormDraft>();
  const baseline = ref<ProfileFormDraft>();
  const editing = ref(false);
  const busy = ref(false);
  const proposal = ref<ProfileWriteProposal>();
  const error = ref<string>();

  async function load(): Promise<void> {
    await run(async () => {
      const current = await api.profile.get();
      profile.value = current;
      if (!editing.value) {
        draft.value = profileDraft(current);
        baseline.value = cloneProfileDraft(draft.value);
      }
    });
  }

  function beginEdit(): void {
    if (!profile.value) return;
    draft.value = profileDraft(profile.value);
    baseline.value = cloneProfileDraft(draft.value);
    proposal.value = undefined;
    error.value = undefined;
    editing.value = true;
  }

  function cancelEdit(): void {
    proposal.value = undefined;
    error.value = undefined;
    editing.value = false;
    if (profile.value) {
      draft.value = profileDraft(profile.value);
      baseline.value = cloneProfileDraft(draft.value);
    }
  }

  function addTarget(): void {
    if (!draft.value || draft.value.careerTargets.length >= 20) return;
    const target: ProfileTargetDraft = {
      id: crypto.randomUUID(), idKind: "opaque", role: "", industries: "", locations: "", isPrimary: false,
    };
    draft.value = { ...draft.value, careerTargets: [...draft.value.careerTargets, target] };
  }

  function updateTarget(id: string, field: "role" | "industries" | "locations", value: string): void {
    if (!draft.value) return;
    draft.value = { ...draft.value, careerTargets: draft.value.careerTargets.map((target) =>
      target.id === id ? { ...target, [field]: value } : target,
    ) };
  }

  function removeTarget(id: string): void {
    if (draft.value) draft.value = { ...draft.value, careerTargets: draft.value.careerTargets.filter((target) => target.id !== id) };
  }

  function setPrimary(id: string): void {
    if (!draft.value) return;
    draft.value = { ...draft.value, careerTargets: draft.value.careerTargets.map((target) =>
      ({ ...target, isPrimary: target.id === id }),
    ) };
  }

  async function prepare(): Promise<void> {
    if (!profile.value || !draft.value || !baseline.value) return;
    const changes = profileChanges(baseline.value, draft.value);
    if (!Object.keys(changes).length) { error.value = "没有需要保存的修改"; return; }
    await run(async () => {
      proposal.value = profile.value!.syncStatus === "clean" || profile.value!.syncStatus === "pending"
        ? await api.profile.prepareUpdate(changes)
        : await api.profile.prepareReapply(changes);
    });
  }

  async function acceptServer(): Promise<void> {
    await run(async () => { proposal.value = await api.profile.prepareAcceptServer(); });
  }

  async function confirm(): Promise<void> {
    if (!proposal.value) return;
    await run(async () => {
      const acceptedServer = proposal.value!.kind === "accept_server";
      const current = await api.profile.executeProposal(proposal.value!.id);
      profile.value = { ...current, syncStatus: acceptedServer ? "clean" : "pending" };
      draft.value = profileDraft(current);
      baseline.value = cloneProfileDraft(draft.value);
      proposal.value = undefined;
      editing.value = false;
    });
  }

  async function run(action: () => Promise<void>): Promise<void> {
    busy.value = true; error.value = undefined;
    try { await action(); } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "个人信息操作失败";
    } finally { busy.value = false; }
  }

  return {
    profile, draft, proposal, editing, busy, error, load, beginEdit, cancelEdit,
    addTarget, updateTarget, removeTarget, setPrimary, prepare, acceptServer, confirm,
  };
}
