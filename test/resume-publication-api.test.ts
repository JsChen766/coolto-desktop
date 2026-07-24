import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedRequester } from "../src/api/api-transport.js";
import { ResumePublicationApi } from "../src/api/resume-publication-api.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";

test("publication API sends evidence and structured data without candidate internals", async () => {
  const requester = new RecordingRequester();
  const api = new ResumePublicationApi(requester);
  const { proposalBuilder, ready } = await createReadySaveFixture();
  const payload = proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理简历",
    mode: "new_resume",
  });

  await api.stageNew(payload, "approval-payload-hash");

  assert.equal(requester.path, "/v1/product/resumes/staged");
  assert.equal(requester.init?.method, "POST");
  const body = JSON.parse(String(requester.init?.body)) as Record<string, unknown>;
  assert.equal(body.idempotencyKey, "approval-payload-hash");
  assert.equal(body.proposalId, payload.proposalId);
  assert.deepEqual(body.structured, payload.structured);
  assert.deepEqual(body.evidenceBindings, payload.evidenceBindings);
  assert.equal("candidateId" in body, false);
  assert.equal("observation" in body, false);
});

test("publication API sends raw browser observation only to verify route", async () => {
  const requester = new RecordingRequester();
  const api = new ResumePublicationApi(requester);
  const { proposalBuilder, ready } = await createReadySaveFixture();
  const payload = proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理简历",
    mode: "new_resume",
  });

  await api.verify("resume/a", "variant b", payload.observation);

  assert.equal(
    requester.path,
    "/v1/product/resumes/resume%2Fa/variants/variant%20b/verify-layout",
  );
  const body = JSON.parse(String(requester.init?.body)) as Record<string, unknown>;
  assert.deepEqual(body.observation, payload.observation);
});

class RecordingRequester implements AuthenticatedRequester {
  public path = "";
  public init: RequestInit | undefined;

  public async request<T>(path: string, init?: RequestInit): Promise<T> {
    this.path = path;
    this.init = init;
    return {
      resumeId: "resume-1",
      variantId: "variant-1",
      gateStatus: "unverified",
      publicationStatus: "staged",
      activeVariantId: null,
      created: true,
    } as T;
  }
}
