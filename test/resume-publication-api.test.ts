import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedRequester } from "../src/api/api-transport.js";
import { ResumePublicationApi } from "../src/api/resume-publication-api.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import { cloudResumeFixture } from "./support/cloud-resume-fixture.js";

test("publication API atomically sends structure, evidence, and browser observation", async () => {
  const requester = new RecordingRequester();
  const api = new ResumePublicationApi(requester);
  const { proposalBuilder, ready } = await createReadySaveFixture();
  const payload = proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理简历",
    mode: "new_resume",
  });

  await api.publishNew(payload, "approval-payload-hash");

  assert.equal(requester.path, "/v1/product/resumes/publish");
  assert.equal(requester.init?.method, "POST");
  const body = JSON.parse(String(requester.init?.body)) as Record<string, unknown>;
  assert.equal(body.idempotencyKey, "approval-payload-hash");
  assert.equal(body.proposalId, payload.proposalId);
  assert.deepEqual(body.structured, payload.structured);
  assert.deepEqual(body.evidenceBindings, payload.evidenceBindings);
  assert.deepEqual(body.observation, payload.observation);
  assert.equal("candidateId" in body, false);
});

test("replacing a resume uses PUT and sends the expected content hash", async () => {
  const requester = new RecordingRequester();
  const api = new ResumePublicationApi(requester);
  const { proposalBuilder, ready } = await createReadySaveFixture();
  const payload = proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理简历",
    mode: "replace_resume",
    resumeId: "resume/a",
    expectedContentHash: "base-hash",
  });

  await api.publishExisting(payload, "approval-payload-hash");

  assert.equal(requester.path, "/v1/product/resumes/resume%2Fa/publish");
  assert.equal(requester.init?.method, "PUT");
  const body = JSON.parse(String(requester.init?.body)) as Record<string, unknown>;
  assert.equal(body.expectedContentHash, "base-hash");
});

class RecordingRequester implements AuthenticatedRequester {
  public path = "";
  public init: RequestInit | undefined;

  public async request<T>(path: string, init?: RequestInit): Promise<T> {
    this.path = path;
    this.init = init;
    const resume = cloudResumeFixture();
    return {
      ...resume,
      score: {
        overall: resume.score.overall,
        relevance: resume.score.relevance,
        clarity: resume.score.clarity,
        evidence_strength: resume.score.evidenceStrength,
        quantified_impact: resume.score.quantifiedImpact,
      },
      created: true,
      pageUsageRatio: 0.9,
    } as T;
  }
}
