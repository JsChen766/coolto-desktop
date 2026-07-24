import assert from "node:assert/strict";
import test from "node:test";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { createResumeSaveApprovalDraft } from "../src/resume/save/approval-draft.js";
import type {
  ResumePublicationGateway,
  ResumeSaveApprovalPayload,
} from "../src/resume/save/types.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import { cloudResumeFixture } from "./support/cloud-resume-fixture.js";

test("resume save performs no cloud write before accept or after reject", async () => {
  const payload = await savePayload();
  const gateway = new RecordingGateway();
  const approvals = manager(gateway);
  const request = await approvals.request(createResumeSaveApprovalDraft(payload), payload);

  assert.deepEqual(gateway.calls, []);
  await approvals.resolve(request.id, { type: "reject" });
  assert.deepEqual(gateway.calls, []);
});

test("accepted new resume save performs one atomic publication write", async () => {
  const payload = await savePayload();
  const gateway = new RecordingGateway();
  const approvals = manager(gateway);
  const request = await approvals.request(createResumeSaveApprovalDraft(payload), payload);

  await approvals.resolve(request.id, { type: "accept" });

  assert.deepEqual(gateway.calls, ["publishNew"]);
});

test("accepted replacement performs one atomic conditional write", async () => {
  const payload = {
    ...await savePayload(),
    mode: "replace_resume" as const,
    resumeId: "resume-1",
    expectedContentHash: "content-hash-1",
  };
  const gateway = new RecordingGateway();
  const approvals = manager(gateway);
  const request = await approvals.request(createResumeSaveApprovalDraft(payload), payload);

  await approvals.resolve(request.id, { type: "accept" });

  assert.deepEqual(gateway.calls, ["publishExisting"]);
});

function manager(gateway: ResumePublicationGateway) {
  return createActionApprovalManager(
    { createExperience: async () => { throw new Error("not used"); } },
    new ExperienceImportProposalStore(),
    gateway,
  );
}

async function savePayload(): Promise<ResumeSaveApprovalPayload> {
  const { proposalBuilder, ready } = await createReadySaveFixture();
  return proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理简历",
    mode: "new_resume",
  });
}

class RecordingGateway implements ResumePublicationGateway {
  public readonly calls: string[] = [];
  public async listResumes() { return []; }
  public async getResume() { return cloudResumeFixture(); }
  public async publishNew() {
    this.calls.push("publishNew");
    return { ...cloudResumeFixture(), created: true, pageUsageRatio: 0.9 };
  }
  public async publishExisting() {
    this.calls.push("publishExisting");
    return { ...cloudResumeFixture(), created: false, pageUsageRatio: 0.9 };
  }
}
