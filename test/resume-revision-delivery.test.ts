import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRevisionDeliveryCurrent,
  createRevisionDeliveryManifest,
  sameRevisionDelivery,
} from "../src/resume/workspace/revision-delivery-contract.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";

test("preview save and PDF freeze one current mechanical revision", async () => {
  const { ready } = await createReadySaveFixture();
  const manifest = createRevisionDeliveryManifest(ready);

  assert.equal(manifest.candidateId, ready.candidateId);
  assert.equal(manifest.revision, ready.revision);
  assert.equal(manifest.observedRevision, ready.compileObservedRevision);
  assert.equal(manifest.structureHash.length, 64);
  assert.equal(sameRevisionDelivery(manifest, { ...manifest, consumer: "save" }), true);
  assert.equal(sameRevisionDelivery(manifest, { ...manifest, consumer: "pdf" }), true);
});

test("missing or stale mechanical readiness cannot freeze delivery", async () => {
  const { ready } = await createReadySaveFixture();
  const missing = structuredClone(ready);
  delete missing.compileObservedRevision;
  assert.throws(() => createRevisionDeliveryManifest(missing), /current|measurement|revision/iu);

  const stale = structuredClone(ready);
  stale.compileObservedRevision = stale.revision - 1;
  assert.throws(() => createRevisionDeliveryManifest(stale), /current|measurement|revision/iu);
});

test("a changed structure or revision rejects an already frozen delivery", async () => {
  const { ready } = await createReadySaveFixture();
  const manifest = createRevisionDeliveryManifest(ready);
  const changed = structuredClone(ready);
  changed.structure.sections[0]!.items[0]!.title = "changed";
  assert.throws(() => assertRevisionDeliveryCurrent(manifest, changed), /changed|stale|current/iu);

  const advanced = structuredClone(ready);
  advanced.revision += 1;
  advanced.compileObservedRevision = advanced.revision;
  assert.throws(() => assertRevisionDeliveryCurrent(manifest, advanced), /changed|stale|revision/iu);
});
