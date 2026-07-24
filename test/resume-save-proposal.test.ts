import assert from "node:assert/strict";
import test from "node:test";

import { createReadySaveFixture } from "./support/resume-save-fixture.js";

test("ready workspace becomes an immutable save proposal with raw layout data", async () => {
  const { proposalBuilder, ready } = await createReadySaveFixture();
  const payload = proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理简历",
    mode: "new_resume",
  });

  assert.equal(payload.structured.quality_status, "passed");
  assert.equal(payload.structured.layout_usage_ratio, 0.89);
  assert.equal(payload.evidenceBindings.length, 2);
  assert.equal(payload.observation.page_count, 1);
  assert.equal(payload.observation.fonts_ready, true);
  assert.equal(payload.observation.viewport.width_px, 1280);
  assert.equal(payload.observation.bullets.length, 2);
  assert.match(payload.observation.idempotency_key, /^resume-save-.+:layout$/);

  ready.structure.sections[0]!.heading = "mutated outside payload";
  assert.notEqual(payload.structured.sections[0]!.heading, "mutated outside payload");
});

test("replacement proposals require an explicit resume and content hash", async () => {
  const { proposalBuilder, ready } = await createReadySaveFixture();
  assert.throws(
    () =>
      proposalBuilder.build({
        candidateId: ready.candidateId,
        expectedRevision: ready.revision,
        title: "覆盖当前简历",
        mode: "replace_resume",
      }),
    /resumeId/,
  );
});
