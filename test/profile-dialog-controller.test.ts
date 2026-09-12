import assert from "node:assert/strict";
import test from "node:test";

import type { DesktopApi, ProfileContactView, ProfileWriteProposal } from "../src/desktop/shared/types.js";
import { useProfileDialog } from "../src/desktop/renderer/src/profile/use-profile-dialog.js";

test("Profile dialog uses update for pending and reapply for blocked sync states", async () => {
  for (const [status, expected] of [
    ["pending", "update"], ["conflict", "reapply"], ["failed", "reapply"],
  ] as const) {
    const calls: string[] = [];
    const dialog = useProfileDialog(api(status, calls));
    await dialog.load();
    dialog.beginEdit();
    dialog.draft.value = { ...dialog.draft.value!, phone: "+852 8765 4321" };
    await dialog.prepare();
    assert.equal(calls[0], expected);
    assert.equal(dialog.proposal.value?.kind, expected === "update" ? "manual" : "reapply");
  }
});

function api(status: ProfileContactView["syncStatus"], calls: string[]): DesktopApi {
  const profile = {
    fullName: "Alice", phone: "+852 1234 5678", contactEmail: "alice@example.test",
    location: null, linkedinUrl: null, githubUrl: null, personalWebsite: null, email: null,
    currentTitle: null, currentCompany: null, yearsOfExperience: null, careerStage: null,
    targetRoles: [], targetIndustries: [], targetLocations: [], careerTargets: [],
    preferredLanguage: "zh-CN", resumeStyle: null, entityVersion: 1,
    updatedAt: "2026-08-03T00:00:00Z", syncStatus: status,
  } satisfies ProfileContactView;
  const proposal = (kind: ProfileWriteProposal["kind"]): ProfileWriteProposal => ({
    id: `profile-${kind}`, kind, current: structuredClone(profile), next: structuredClone(profile),
    syncStatus: status, preparedAt: "2026-08-03T00:00:00Z",
  });
  return { profile: {
    get: async () => profile,
    prepareUpdate: async () => { calls.push("update"); return proposal("manual"); },
    prepareReapply: async () => { calls.push("reapply"); return proposal("reapply"); },
    prepareAcceptServer: async () => proposal("accept_server"),
    executeProposal: async () => profile,
  } } as unknown as DesktopApi;
}
