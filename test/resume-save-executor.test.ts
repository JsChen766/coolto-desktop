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

test("resume save performs no cloud write before accept or after reject", async () => {
  const payload = await savePayload();
  const gateway = new RecordingGateway();
  const approvals = manager(gateway);
  const request = await approvals.request(
    createResumeSaveApprovalDraft(payload),
    payload,
  );

  assert.deepEqual(gateway.calls, []);
  await approvals.resolve(request.id, { type: "reject" });
  assert.deepEqual(gateway.calls, []);
});

test("accepted resume save executes stage verify accept in order", async () => {
  const payload = await savePayload();
  const gateway = new RecordingGateway();
  const approvals = manager(gateway);
  const events: string[] = [];
  approvals.subscribe((event) => {
    events.push(event.type);
  });
  const request = await approvals.request(
    createResumeSaveApprovalDraft(payload),
    payload,
  );

  await approvals.resolve(request.id, { type: "accept" });

  assert.deepEqual(gateway.calls, ["stageNew", "verify", "accept"]);
  assert.ok(events.includes("approval.completed"));
});

test("failed server verification discards the staged variant", async () => {
  const payload = await savePayload();
  const gateway = new RecordingGateway(false);
  const approvals = manager(gateway);
  const request = await approvals.request(
    createResumeSaveApprovalDraft(payload),
    payload,
  );
  await approvals.resolve(request.id, { type: "accept" });
  assert.deepEqual(gateway.calls, ["stageNew", "verify", "getResume", "reject"]);
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
  public constructor(private readonly passes = true) {}
  public async listResumes() { return []; }
  public async getResume(resumeId: string) {
    this.calls.push("getResume");
    return {
      id: resumeId, title: "Resume", targetRole: null, jdId: "jd-1",
      activeVariantId: null, status: "draft" as const,
      createdAt: "2026-07-24", updatedAt: "2026-07-24", items: [], variants: [],
    };
  }
  public async stageNew() {
    this.calls.push("stageNew");
    return stageResult();
  }
  public async stageVariant() {
    this.calls.push("stageVariant");
    return stageResult();
  }
  public async verify() {
    this.calls.push("verify");
    return {
      resumeId: "resume-1", variantId: "variant-1",
      status: this.passes ? "passed" as const : "needs_revision" as const,
      canAccept: this.passes, violations: this.passes ? [] : [{ code: "underfilled", message: "low" }],
      pageUsageRatio: this.passes ? 0.9 : 0.7,
    };
  }
  public async accept() {
    this.calls.push("accept");
    return {
      resumeId: "resume-1", variantId: "variant-1", activeVariantId: "variant-1",
      gateStatus: "passed" as const, publicationStatus: "published" as const,
    };
  }
  public async reject() { this.calls.push("reject"); }
}

function stageResult() {
  return {
    resumeId: "resume-1", variantId: "variant-1", gateStatus: "unverified" as const,
    publicationStatus: "staged" as const, activeVariantId: null, created: true,
  };
}
