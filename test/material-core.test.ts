import assert from "node:assert/strict";
import test from "node:test";
import type { MaterialAssetV1 } from "../src/material/material-types.js";

import {
  MaterialContractError,
  isMaterialAssetV1,
  normalizeMaterialAsset,
  validateMaterialAsset,
} from "../src/material/material-normalizer.js";
import {
  canonicalMaterialJson,
  deriveMaterialId,
  hashMaterialBytes,
  materialContentIdentityKey,
  materialIdentityKey,
  toMaterialReference,
} from "../src/material/material-identity.js";
import {
  citationBindsToMaterial,
  normalizeMaterialCitation,
  validateMaterialCitation,
} from "../src/material/material-citations.js";
import {
  planMaterialRelationProposal,
  validateMaterialRelationProposal,
} from "../src/material/material-relations.js";
import {
  evaluateOCRConfidence,
  isOCRTrustedFact,
  normalizeOCRConfidence,
  planOCRUserConfirmation,
} from "../src/material/material-ocr-confidence.js";
import {
  materialDedupeKey,
  planMaterialDedupe,
} from "../src/material/material-dedupe.js";

const NOW = "2026-09-08T00:00:00.000Z";
const USER_UPLOAD_AUTH = { sourceKind: "user_upload" as const, materialIntent: false };
const DELIVERY_AUTH = { sourceKind: "delivery_resume" as const, materialIntent: true };

function candidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "material.asset",
    version: 1,
    identity: {
      materialId: "mat_01",
      ownerId: "owner_01",
      contentHash: "A".repeat(64),
      contentVersion: 1,
    },
    metadata: {
      title: "Quarterly review",
      mediaKind: "pdf",
      sourceKind: "user_upload",
      sourceLabel: "user supplied document",
      originalFilename: "quarterly-review.pdf",
      capturedAt: NOW,
    },
    processing: {
      status: "unprocessed",
      ocr: null,
    },
    ...overrides,
  };
}

function asset(overrides: Record<string, unknown> = {}) {
  return normalizeMaterialAsset(candidate(overrides));
}

function expectContractError(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) =>
    error instanceof MaterialContractError && error.code === code);
}

test("normalizes a strict owner-bound asset without mutating input", () => {
  const input = candidate();
  const before = structuredClone(input);
  const value = normalizeMaterialAsset(input);

  assert.deepEqual(input, before);
  assert.equal(value.identity.contentHash, "a".repeat(64));
  assert.equal(value.metadata.title, "Quarterly review");
  assert.equal(value.processing.status, "unprocessed");
  assert.deepEqual(validateMaterialAsset(value), []);
  assert.equal(isMaterialAssetV1(value), true);
  const ordinary = normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, title: "Q1/2026", sourceLabel: "Author retrospective" },
  }));
  assert.equal(ordinary.metadata.title, "Q1/2026");
});

test("rejects unsafe paths, URLs, credentials, and raw-body fields", () => {
  expectContractError(() => normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, sourceLabel: "C:\\Users\\J\\report.pdf" },
  })), "unsafe_value");
  expectContractError(() => normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, sourceLabel: "https://example.test/report" },
  })), "unsafe_value");
  expectContractError(() => normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, title: "Authorization: Bearer abc" },
  })), "unsafe_value");
  expectContractError(() => normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, sourceLabel: "See www.example.test/file" },
  })), "unsafe_value");
  for (const url of ["See example.com,", "localhost:3000", "请见 示例.中国"]) {
    expectContractError(() => normalizeMaterialAsset(candidate({
      metadata: { ...candidate().metadata as object, sourceLabel: url },
    })), "unsafe_value");
  }
  expectContractError(() => normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, sourceLabel: "Cookie: session=secret" },
  })), "unsafe_value");
  expectContractError(() => normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, sourceLabel: "report /home/user/private.pdf" },
  })), "unsafe_value");
  for (const forbiddenPath of ["see /srv/report.pdf", "see /secret", "path:/secret", "see,/secret", "\\Users\\J\\report.pdf"]) {
    expectContractError(() => normalizeMaterialAsset(candidate({
      metadata: { ...candidate().metadata as object, sourceLabel: forbiddenPath },
    })), "unsafe_value");
  }
  for (const credential of [
    "session_token=abc", "password_hash=abc", "csrf_token=abc", "sessionToken=abc",
    "CSRFToken=abc", "APIKEY=abc", "user_password=abc", "session.token=abc",
    "{\"sessionToken\":\"abc\"}",
  ]) {
    expectContractError(() => normalizeMaterialAsset(candidate({
      metadata: { ...candidate().metadata as object, sourceLabel: credential },
    })), "unsafe_value");
  }
  expectContractError(() => normalizeMaterialAsset({
    ...candidate(),
    rawText: "source body must not be retained",
  }), "unknown_field");
});

test("requires explicit intent for original delivery resumes", () => {
  const delivery = candidate({
    metadata: { ...candidate().metadata as object, sourceKind: "delivery_resume" },
  });
  assert.equal(isMaterialAssetV1(delivery), false);
  assert.equal(validateMaterialAsset(delivery).some((issue) => issue.code === "not_material_authorized"), true);
  expectContractError(() => normalizeMaterialAsset(delivery), "not_material_authorized");
  const authorized = normalizeMaterialAsset(delivery, DELIVERY_AUTH);
  const hiddenAuthorization = { ...DELIVERY_AUTH };
  Object.defineProperty(hiddenAuthorization, Symbol("extra"), { value: true });
  expectContractError(() => normalizeMaterialAsset(delivery, hiddenAuthorization), "unknown_field");
  assert.equal(authorized.metadata.sourceKind, "delivery_resume");
  expectContractError(() => toMaterialReference(authorized), "not_material_authorized");
  const reference = toMaterialReference(authorized, DELIVERY_AUTH);
  assert.equal(reference.contentHash, authorized.identity.contentHash);
  assert.equal(reference.sourceKind, "delivery_resume");
  expectContractError(() => materialIdentityKey(reference), "not_material_authorized");
  expectContractError(() => materialContentIdentityKey(reference), "not_material_authorized");
  assert.equal(materialIdentityKey(reference, DELIVERY_AUTH), materialIdentityKey(authorized, DELIVERY_AUTH));
  expectContractError(() => materialDedupeKey(authorized), "not_material_authorized");
  expectContractError(() => planMaterialDedupe(authorized, [authorized]), "not_material_authorized");
  assert.equal(planMaterialDedupe(authorized, [authorized], DELIVERY_AUTH).duplicate, true);
  expectContractError(() => planMaterialRelationProposal({
    proposalId: "proposal_delivery",
    preparedAt: NOW,
    classification: "unclassified",
    material: authorized,
    experienceReferences: [],
  }), "not_material_authorized");
  expectContractError(() => planMaterialRelationProposal({
    proposalId: "proposal_delivery",
    preparedAt: NOW,
    classification: "unclassified",
    material: authorized,
    experienceReferences: [],
  }, { sourceKind: "delivery_resume", materialIntent: false }), "not_material_authorized");
  const proposal = planMaterialRelationProposal({
    proposalId: "proposal_delivery",
    preparedAt: NOW,
    classification: "unclassified",
    material: authorized,
    experienceReferences: [],
  }, DELIVERY_AUTH);
  assert.deepEqual(validateMaterialRelationProposal(proposal, DELIVERY_AUTH), []);
});

test("hashes bytes and keeps content identity independent from metadata rename", () => {
  const bytes = new TextEncoder().encode("synthetic material bytes");
  const hash = hashMaterialBytes(bytes);
  assert.match(hash, /^[0-9a-f]{64}$/u);
  assert.equal(deriveMaterialId("owner_01", hash), deriveMaterialId("owner_01", hash));

  const original = asset();
  const renamed = asset({
    metadata: { ...candidate().metadata as object, title: "Renamed review" },
  });
  assert.equal(materialIdentityKey(original), materialIdentityKey(renamed));
  assert.equal(original.identity.contentHash, renamed.identity.contentHash);
  assert.equal(original.identity.contentVersion, renamed.identity.contentVersion);
});

test("normalizes page, paragraph, offset citations and binds every version", () => {
  const value = asset();
  const citation = normalizeMaterialCitation({
    schema: "material.citation",
    version: 1,
    ownerId: value.identity.ownerId,
    materialId: value.identity.materialId,
    materialHash: value.identity.contentHash,
    materialVersion: value.identity.contentVersion,
    location: {
      kind: "page_paragraph_offset",
      page: 2,
      paragraph: 3,
      startOffset: 4,
      endOffset: 19,
      sectionLabel: "Outcomes",
    },
  }, value);
  const reference = toMaterialReference(value);
  assert.equal(citationBindsToMaterial(citation, reference), true);

  assert.equal(citation.location.kind, "page_paragraph_offset");
  const sectionCitation = normalizeMaterialCitation({
    ...citation,
    location: { kind: "section", sectionLabel: "Summary" },
  }, value);
  assert.equal(sectionCitation.location.kind, "section");
  assert.equal(citationBindsToMaterial(citation, value), true);
  expectContractError(() => normalizeMaterialCitation({
    ...citation,
    materialHash: "b".repeat(64),
  }, value), "citation_material_mismatch");
  expectContractError(() => normalizeMaterialCitation({
    ...citation,
    materialVersion: 2,
  }, value), "citation_material_mismatch");
  expectContractError(() => normalizeMaterialCitation({
    ...citation,
    location: { ...citation.location, startOffset: 20 },
  }, value), "invalid_location");
  expectContractError(() => normalizeMaterialCitation({
    ...citation,
    quote: "raw source text",
  }, value), "unknown_field");
});

test("plans unclassified and multi-Experience relation proposals without body copies", () => {
  const value = asset();
  const citation = (startOffset: number) => ({
    schema: "material.citation",
    version: 1,
    ownerId: value.identity.ownerId,
    materialId: value.identity.materialId,
    materialHash: value.identity.contentHash,
    materialVersion: value.identity.contentVersion,
    location: { kind: "offset", startOffset, endOffset: startOffset + 5, sectionLabel: null },
  });
  const relationInput = {
    proposalId: "proposal_01",
    preparedAt: NOW,
    classification: "classified" as const,
    material: value,
    experienceReferences: [
      { experienceId: "experience_b", citations: [citation(20)] },
      { experienceId: "experience_a", citations: [citation(2)] },
    ],
  };
  const before = structuredClone(relationInput);
  const proposal = planMaterialRelationProposal(relationInput);
  assert.deepEqual(relationInput, before);

  assert.deepEqual(
    proposal.experienceReferences.map((reference) => reference.experienceId),
    ["experience_a", "experience_b"],
  );
  assert.equal("rawText" in proposal, false);
  assert.equal("content" in proposal, false);

  assert.deepEqual(validateMaterialRelationProposal(proposal, USER_UPLOAD_AUTH), []);
  const unclassified = planMaterialRelationProposal({
    proposalId: "proposal_02",
    preparedAt: NOW,
    classification: "unclassified",
    material: value,
    experienceReferences: [],
  });
  assert.equal(unclassified.classification, "unclassified");
  assert.deepEqual(unclassified.experienceReferences, []);
  expectContractError(() => planMaterialRelationProposal({
    proposalId: "proposal_raw",
    preparedAt: NOW,
    classification: "unclassified",
    material: value,
    experienceReferences: [],
    rawText: "must be rejected",
  } as unknown as Parameters<typeof planMaterialRelationProposal>[0]), "unknown_field");
  expectContractError(() => planMaterialRelationProposal({
    proposalId: "proposal_sparse",
    preparedAt: NOW,
    classification: "classified",
    material: value,
    experienceReferences: new Array(1),
  } as unknown as Parameters<typeof planMaterialRelationProposal>[0]), "invalid_processing");
});

test("keeps OCR trust fail-closed for missing engine, low confidence, and expiry", () => {
  const policy = {
    schema: "material.ocr-trust-policy" as const,
    version: 1 as const,
    minimumOverallConfidence: 0.8,
    minimumSegmentConfidence: 0.75,
  };
  const trusted = normalizeOCRConfidence({
    schema: "material.ocr-confidence",
    version: 1,
    engine: { name: "synthetic-ocr", version: "2.1" },
    processingStatus: "completed",
    overallConfidence: 0.91,
    segments: [
      { segmentId: "segment_1", confidence: 0.88 },
      { segmentId: "segment_2", confidence: 0.93 },
    ],
    needsUserConfirmation: false,
    confirmedAt: null,
    expiresAt: "2026-10-01T00:00:00.000Z",
  });
  assert.equal(evaluateOCRConfidence(trusted, policy, NOW).trusted, true);
  expectContractError(() => normalizeOCRConfidence({ ...trusted, segments: new Array(1) }), "invalid_processing");
  expectContractError(() => normalizeOCRConfidence({ ...trusted, engine: { name: " ", version: " " } }), "unsafe_value");

  const low = normalizeOCRConfidence({
    ...trusted,
    overallConfidence: 0.79,
    needsUserConfirmation: true,
  });
  assert.equal(evaluateOCRConfidence(low, policy, NOW).trusted, false);
  assert.equal(planOCRUserConfirmation(low, policy, NOW).required, true);
  const lowSegment = normalizeOCRConfidence({
    ...trusted,
    segments: [{ segmentId: "segment_1", confidence: 0.7 }],
    needsUserConfirmation: false,
    confirmedAt: NOW,
  });
  assert.equal(evaluateOCRConfidence(lowSegment, policy, NOW).reason, "segment_below_threshold");
  assert.equal(isOCRTrustedFact(lowSegment, policy, NOW), false);

  const noEngine = normalizeOCRConfidence({ ...trusted, engine: null });
  assert.equal(evaluateOCRConfidence(noEngine, policy, NOW).trusted, false);

  const expired = normalizeOCRConfidence({
    ...trusted,
    expiresAt: "2026-09-07T23:59:59.000Z",
  });
  assert.equal(evaluateOCRConfidence(expired, policy, NOW).reason, "expired");
  assert.equal(planOCRUserConfirmation(expired, policy, NOW).allowed, false);
});

test("dedupes by owner, content hash, and canonical metadata while preserving identity", () => {
  const first = asset();
  const same = asset();
  const renamed = asset({
    metadata: { ...candidate().metadata as object, title: "Renamed review" },
  });
  assert.equal(materialDedupeKey(first), materialDedupeKey(same));
  assert.notEqual(materialDedupeKey(first), materialDedupeKey(renamed));
  const otherOwner = asset({
    identity: { ...candidate().identity as object, ownerId: "owner_02" },
  });
  assert.notEqual(materialDedupeKey(first), materialDedupeKey(otherOwner));
  assert.deepEqual(planMaterialDedupe(first, [otherOwner]).contentIdentityMatches, []);

  const result = planMaterialDedupe(renamed, [first]);
  assert.equal(result.duplicate, false);
  assert.deepEqual(result.contentIdentityMatches, [first.identity.materialId]);
  assert.deepEqual(planMaterialDedupe(first, [same]).matchingMaterialIds, [same.identity.materialId]);
});

test("rejects malformed strict assets before they can become facts", () => {
  assert.notDeepEqual(validateMaterialAsset({}), []);
  expectContractError(() => normalizeMaterialAsset(candidate({
    identity: { ...candidate().identity as object, materialId: "C:\\material" },
  })), "invalid_id");
  expectContractError(() => normalizeMaterialAsset(candidate({
    identity: { ...candidate().identity as object, ownerId: "owner@example.com" },
  })), "invalid_id");
  expectContractError(() => normalizeMaterialAsset(candidate({
    identity: { ...candidate().identity as object, contentHash: "not-a-sha256" },
  })), "invalid_hash");
  expectContractError(() => normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, mediaKind: "exe" },
  })), "invalid_enum");
  expectContractError(() => normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, capturedAt: "2026-02-31T00:00:00.000Z" },
  })), "invalid_timestamp");
  const tags = candidate();
  Object.defineProperty(tags.metadata, "tags", { value: ["hidden"], enumerable: false });
  expectContractError(() => normalizeMaterialAsset(tags), "unknown_field");
});
test("requires complete citation binding and rejects hidden fields", () => {
  const value = asset();
  const citation = {
    schema: "material.citation",
    version: 1,
    ownerId: value.identity.ownerId,
    materialId: value.identity.materialId,
    materialHash: value.identity.contentHash,
    materialVersion: value.identity.contentVersion,
    location: { kind: "section", sectionLabel: "Results" },
  };
  assert.notDeepEqual(validateMaterialCitation(citation), []);
  assert.notDeepEqual(validateMaterialCitation({ ...citation, ownerId: "owner_02" }, value), []);
  assert.notDeepEqual(validateMaterialCitation({ ...citation, materialId: "mat_02" }, value), []);
  const uppercase = normalizeMaterialCitation({ ...citation, materialHash: "A".repeat(64) }, value);
  assert.equal(uppercase.materialHash, "a".repeat(64));
  assert.equal(citationBindsToMaterial(uppercase, value), true);

  const hiddenCitation = { ...citation };
  Object.defineProperty(hiddenCitation, "quote", { value: "raw source", enumerable: false });
  expectContractError(() => normalizeMaterialCitation(hiddenCitation, value), "unknown_field");
  const hiddenLocation = { ...citation, location: { ...citation.location } };
  Object.defineProperty(hiddenLocation.location, "extra", { value: "hidden", enumerable: false });
  expectContractError(() => normalizeMaterialCitation(hiddenLocation, value), "unknown_field");
});

test("canonical JSON fails closed for unsupported values and arrays", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, Symbol("raw"), () => "secret"]) {
    assert.throws(() => canonicalMaterialJson(value));
  }
  assert.throws(() => canonicalMaterialJson({ value: undefined }));
  const symbolKey = {};
  Object.defineProperty(symbolKey, Symbol("raw"), { value: "secret" });
  assert.throws(() => canonicalMaterialJson(symbolKey));
  assert.throws(() => canonicalMaterialJson([undefined]));
  assert.throws(() => canonicalMaterialJson(new Array(1)));
  const highIndex: unknown[] = [];
  Object.defineProperty(highIndex, "4294967295", { value: "extra" });
  assert.throws(() => canonicalMaterialJson(highIndex));
  assert.throws(() => canonicalMaterialJson(Object.create({ inherited: "value" })));
  assert.equal(canonicalMaterialJson({ b: 2, a: 1 }), "{\"a\":1,\"b\":2}");
});

test("rejects sparse, prototype, high-index, and oversized arrays", () => {
  const value = asset();
  const citation = {
    schema: "material.citation",
    version: 1,
    ownerId: value.identity.ownerId,
    materialId: value.identity.materialId,
    materialHash: value.identity.contentHash,
    materialVersion: value.identity.contentVersion,
    location: { kind: "offset", startOffset: 1, endOffset: 4, sectionLabel: null },
  };
  const relation = (experienceReferences: unknown[]) => planMaterialRelationProposal({
    proposalId: "proposal_array",
    preparedAt: NOW,
    classification: "classified",
    material: value,
    experienceReferences,
  } as Parameters<typeof planMaterialRelationProposal>[0]);

  const inheritedReferences = new Array(1);
  Object.setPrototypeOf(inheritedReferences, { 0: { experienceId: "experience_a", citations: [citation] } });
  expectContractError(() => relation(inheritedReferences), "invalid_processing");
  const extraReferences = [{ experienceId: "experience_a", citations: [citation] }];
  Object.defineProperty(extraReferences, "extra", { value: "hidden", enumerable: false });
  expectContractError(() => relation(extraReferences), "invalid_processing");
  const highReferences = [{ experienceId: "experience_a", citations: [citation] }];
  Object.defineProperty(highReferences, "4294967295", { value: "not-an-index" });
  expectContractError(() => relation(highReferences), "invalid_processing");
  expectContractError(() => relation(new Array(201)), "invalid_processing");

  const ocr = {
    schema: "material.ocr-confidence",
    version: 1,
    engine: { name: "synthetic-ocr", version: "2.1" },
    processingStatus: "completed",
    overallConfidence: 0.9,
    segments: [{ segmentId: "segment_1", confidence: 0.9 }],
    needsUserConfirmation: false,
    confirmedAt: null,
    expiresAt: null,
  };
  const inheritedSegments = new Array(1);
  Object.setPrototypeOf(inheritedSegments, { 0: ocr.segments[0] });
  expectContractError(() => normalizeOCRConfidence({ ...ocr, segments: inheritedSegments }), "invalid_processing");
  const extraSegments = [...ocr.segments];
  Object.defineProperty(extraSegments, "4294967295", { value: "not-an-index" });
  expectContractError(() => normalizeOCRConfidence({ ...ocr, segments: extraSegments }), "invalid_processing");
  const maximumSegments = Array.from({ length: 20_000 }, (_value, index) => ({ segmentId: `segment_${index}`, confidence: 0.9 }));
  assert.equal(normalizeOCRConfidence({ ...ocr, segments: maximumSegments }).segments.length, 20_000);
  expectContractError(() => normalizeOCRConfidence({ ...ocr, segments: new Array(20_001) }), "invalid_processing");

  const highExisting = [value];
  Object.defineProperty(highExisting, "4294967295", { value: "not-an-index" });
  expectContractError(() => planMaterialDedupe(value, highExisting), "invalid_processing");
  expectContractError(() => planMaterialDedupe(value, new Array(10_001)), "invalid_processing");
});

test("rejects duplicate relation targets and never scans after invalid members", () => {
  const value = asset();
  const citation = {
    schema: "material.citation",
    version: 1,
    ownerId: value.identity.ownerId,
    materialId: value.identity.materialId,
    materialHash: value.identity.contentHash,
    materialVersion: value.identity.contentVersion,
    location: { kind: "page", page: 1, sectionLabel: null },
  };
  const references = [
    { experienceId: "experience_a", citations: [citation] },
    { experienceId: "experience_a", citations: [citation] },
  ];
  expectContractError(() => planMaterialRelationProposal({
    proposalId: "proposal_duplicate",
    preparedAt: NOW,
    classification: "classified",
    material: value,
    experienceReferences: references,
  }), "invalid_id");

  const malformed = candidate({
    processing: { status: "unprocessed", ocr: null, extra: true },
  });
  const unread = asset();
  let identityRead = false;
  Object.defineProperty(unread, "identity", {
    get() {
      identityRead = true;
      throw new Error("unverified member was read");
    },
  });
  expectContractError(() => planMaterialDedupe(value, [value, malformed, unread] as unknown as MaterialAssetV1[]), "unknown_field");
  assert.equal(identityRead, false);
});

test("serializes relation provenance and requires it for delivery validation", () => {
  const value = asset();
  const citation = {
    schema: "material.citation",
    version: 1,
    ownerId: value.identity.ownerId,
    materialId: value.identity.materialId,
    materialHash: value.identity.contentHash,
    materialVersion: value.identity.contentVersion,
    location: { kind: "section", sectionLabel: "Summary" },
  };
  const proposal = planMaterialRelationProposal({
    proposalId: "proposal_provenance",
    preparedAt: NOW,
    classification: "classified",
    material: value,
    experienceReferences: [{ experienceId: "experience_a", citations: [citation] }],
  });
  assert.equal(proposal.sourceKind, "user_upload");
  assert.equal(proposal.materialHash, "a".repeat(64));
  const nonCanonical = { ...proposal, materialHash: "A".repeat(64) };
  assert.notDeepEqual(validateMaterialRelationProposal(nonCanonical, USER_UPLOAD_AUTH), []);

  const delivery = normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, sourceKind: "delivery_resume" },
  }), DELIVERY_AUTH);
  const deliveryProposal = planMaterialRelationProposal({
    proposalId: "proposal_delivery_provenance",
    preparedAt: NOW,
    classification: "unclassified",
    material: delivery,
    experienceReferences: [],
  }, DELIVERY_AUTH);
  assert.equal(validateMaterialRelationProposal(deliveryProposal).some((issue) => issue.code === "not_material_authorized"), true);
  assert.deepEqual(validateMaterialRelationProposal(deliveryProposal, DELIVERY_AUTH), []);
});
test("rejects duplicate citation fingerprints within and across targets", () => {
  const value = asset();
  const citation = {
    schema: "material.citation",
    version: 1,
    ownerId: value.identity.ownerId,
    materialId: value.identity.materialId,
    materialHash: value.identity.contentHash,
    materialVersion: value.identity.contentVersion,
    location: { kind: "offset", startOffset: 1, endOffset: 6, sectionLabel: "Results" },
  };
  const duplicateCase = { ...citation, materialHash: "A".repeat(64) };
  const relation = (experienceReferences: unknown[]) => planMaterialRelationProposal({
    proposalId: "proposal_duplicate_citation",
    preparedAt: NOW,
    classification: "classified",
    material: value,
    experienceReferences,
  } as Parameters<typeof planMaterialRelationProposal>[0]);
  expectContractError(() => relation([{ experienceId: "experience_a", citations: [citation, duplicateCase] }]), "invalid_location");
  expectContractError(() => relation([
    { experienceId: "experience_a", citations: [citation] },
    { experienceId: "experience_b", citations: [citation] },
  ]), "invalid_location");

  const distinct = { ...citation, location: { kind: "offset", startOffset: 10, endOffset: 16, sectionLabel: "Results" } };
  const proposal = relation([{ experienceId: "experience_a", citations: [citation, distinct] }]);
  assert.deepEqual(validateMaterialRelationProposal(proposal, USER_UPLOAD_AUTH), []);
  const first = proposal.experienceReferences[0]!;
  const serializedDuplicate = {
    ...proposal,
    experienceReferences: [{ experienceId: first.experienceId, citations: [first.citations[0], first.citations[0]] }],
  };
  assert.equal(validateMaterialRelationProposal(serializedDuplicate, USER_UPLOAD_AUTH).some((issue) => issue.code === "invalid_location"), true);
});

test("rejects hidden and accessor values in canonical JSON", () => {
  const hiddenString = { value: 1 };
  Object.defineProperty(hiddenString, "rawText", { value: "secret", enumerable: false });
  assert.throws(() => canonicalMaterialJson(hiddenString));

  let getterReads = 0;
  const accessor = {};
  Object.defineProperty(accessor, "value", {
    enumerable: true,
    get() {
      getterReads += 1;
      return 1;
    },
  });
  assert.throws(() => canonicalMaterialJson(accessor));
  assert.equal(getterReads, 0);

  const accessorArray = [1];
  Object.defineProperty(accessorArray, 0, {
    enumerable: true,
    get() {
      getterReads += 1;
      return 1;
    },
  });
  assert.throws(() => canonicalMaterialJson(accessorArray));
  assert.equal(getterReads, 0);
});

test("dedupes mixed sources from plain snapshots without proxy getters", () => {
  const upload = asset();
  const text = asset({
    metadata: { ...candidate().metadata as object, mediaKind: "text", sourceKind: "user_text" },
  });
  const delivery = normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, sourceKind: "delivery_resume" },
  }), DELIVERY_AUTH);
  assert.equal(planMaterialDedupe(upload, [upload, text]).duplicate, true);
  assert.equal(planMaterialDedupe(delivery, [upload, text, delivery], DELIVERY_AUTH).duplicate, true);

  let metadataReads = 0;
  const accessorMember = candidate();
  Object.defineProperty(accessorMember, "metadata", {
    enumerable: true,
    get() {
      metadataReads += 1;
      throw new Error("metadata getter must not run");
    },
  });
  expectContractError(() => planMaterialDedupe(upload, [accessorMember] as unknown as MaterialAssetV1[]), "invalid_input");
  assert.equal(metadataReads, 0);

  let proxyReads = 0;
  const proxyMember = new Proxy(candidate(), {
    get() {
      proxyReads += 1;
      throw new Error("proxy get must not run");
    },
  });
  assert.equal(planMaterialDedupe(upload, [proxyMember] as unknown as MaterialAssetV1[]).duplicate, true);
  const proxiedExisting = new Proxy([upload], {
    get() {
      throw new Error("existing array getter must not run");
    },
  });
  assert.equal(planMaterialDedupe(upload, proxiedExisting as unknown as MaterialAssetV1[]).duplicate, true);
  assert.equal(proxyReads, 0);
  let extraReads = 0;
  const extraMember = candidate();
  Object.defineProperty(extraMember, "extra", {
    enumerable: true,
    get() {
      extraReads += 1;
      return { nested: new Array(10_000) };
    },
  });
  expectContractError(() => planMaterialDedupe(upload, [extraMember] as unknown as MaterialAssetV1[]), "unknown_field");
  assert.equal(extraReads, 0);
});

test("rejects Unicode-equivalent network identifiers without rewriting benign metadata", () => {
  for (const value of ["2001:db8::1", "::1", "::", "1::", "[2001:db8::1]", "[fe80::1%eth0]"]) {
    expectContractError(() => normalizeMaterialAsset(candidate({
      metadata: { ...candidate().metadata as object, sourceLabel: value },
    })), "unsafe_value");
  }
  for (const filename of ["example.com", "example.com.pdf", "127.0.0.1", "127.0.0.1.pdf", "2001:db8::1", "::", "1::", "[fe80::1%eth0]", "示例.中国"]) {
    expectContractError(() => normalizeMaterialAsset(candidate({
      metadata: { ...candidate().metadata as object, originalFilename: filename },
    })), "unsafe_value");
  }

  const listedBypassVectors = [
    ["sourceLabel", "https：／／example．com"],
    ["sourceLabel", "http：／／127．0．0．１"],
    ["sourceLabel", "http：／／127．0．0．1"],
    ["sourceLabel", "127．0．0．１"],
    ["sourceLabel", "127．0．0．1"],
    ["sourceLabel", "localhost。"],
    ["sourceLabel", "example.com，"],
    ["originalFilename", "https：／／example．com"],
    ["originalFilename", "http：／／127．0．0．１"],
    ["originalFilename", "http：／／127．0．0．1"],
    ["originalFilename", "127．0．0．１"],
    ["originalFilename", "127．0．0．1"],
    ["originalFilename", "example.com，"],
  ] as const;
  for (const [field, value] of listedBypassVectors) {
    expectContractError(() => normalizeMaterialAsset(candidate({
      metadata: { ...candidate().metadata as object, [field]: value },
    })), "unsafe_value");
  }

  for (const value of [
    "ＨＴＴＰ：／／ｅｘａｍｐｌｅ．ｃｏｍ",
    "ｈｔｔｐ：／／１２７．０．０．１",
    "127．0．0．１",
    "localhost．",
    "localhost｡",
    "example.com。",
    "example.com、",
    "示例。中国",
  ]) {
    for (const field of ["sourceLabel", "originalFilename"] as const) {
      expectContractError(() => normalizeMaterialAsset(candidate({
        metadata: { ...candidate().metadata as object, [field]: value },
      })), "unsafe_value");
    }
  }

  const benign = [
    ["title", "Q1/2026"],
    ["title", "Q１／２０２６"],
    ["sourceLabel", "Author retrospective"],
    ["sourceLabel", "Version １．２"],
    ["sourceLabel", "Release 2026.09"],
    ["originalFilename", "quarterly-review.pdf"],
    ["originalFilename", "quarterly-review．pdf"],
    ["originalFilename", "resume-v1.2.pdf"],
  ] as const;
  for (const [field, value] of benign) {
    const input = candidate({
      metadata: { ...candidate().metadata as object, [field]: value },
    });
    const normalized = normalizeMaterialAsset(input);
    assert.equal(normalized.metadata[field], value);
    assert.equal((input.metadata as Record<string, unknown>)[field], value);
  }

  expectContractError(() => normalizeOCRConfidence({
    schema: "material.ocr-confidence",
    version: 1,
    engine: { name: "synthetic-ocr", version: "example.com" },
    processingStatus: "completed",
    overallConfidence: 0.9,
    segments: [{ segmentId: "segment_network", confidence: 0.9 }],
    needsUserConfirmation: false,
    confirmedAt: null,
    expiresAt: null,
  }), "unsafe_value");
});

test("rejects strict accessors before invoking their getters", () => {
  let reads = 0;
  const accessorAsset = candidate();
  Object.defineProperty(accessorAsset.identity, "materialId", {
    enumerable: true,
    get() {
      reads += 1;
      return "mat_01";
    },
  });
  expectContractError(() => normalizeMaterialAsset(accessorAsset), "invalid_input");
  assert.equal(reads, 0);

  const value = asset();
  const citation = {
    schema: "material.citation",
    version: 1,
    ownerId: value.identity.ownerId,
    materialId: value.identity.materialId,
    materialHash: value.identity.contentHash,
    materialVersion: value.identity.contentVersion,
    location: { kind: "section", sectionLabel: "Results" },
  };
  const relationInput = {
    proposalId: "proposal_accessor",
    preparedAt: NOW,
    classification: "classified" as const,
    material: value,
    experienceReferences: [{ experienceId: "experience_a", citations: [citation] }],
  };
  Object.defineProperty(relationInput, "experienceReferences", {
    enumerable: true,
    get() {
      reads += 1;
      return [];
    },
  });
  expectContractError(() => planMaterialRelationProposal(relationInput), "invalid_input");
  assert.equal(reads, 0);

  const ocr = {
    schema: "material.ocr-confidence",
    version: 1,
    engine: { name: "synthetic-ocr", version: "2.1" },
    processingStatus: "completed",
    overallConfidence: 0.9,
    segments: [{ segmentId: "segment_accessor", confidence: 0.9 }],
    needsUserConfirmation: false,
    confirmedAt: null,
    expiresAt: null,
  };
  Object.defineProperty(ocr.segments[0], "confidence", {
    enumerable: true,
    get() {
      reads += 1;
      return 0.9;
    },
  });
  expectContractError(() => normalizeOCRConfidence(ocr), "invalid_input");
  assert.equal(reads, 0);

  const slotSegments = [{ segmentId: "segment_slot", confidence: 0.9 }];
  Object.defineProperty(slotSegments, 0, {
    enumerable: true,
    get() {
      reads += 1;
      return { segmentId: "segment_slot", confidence: 0.9 };
    },
  });
  expectContractError(() => normalizeOCRConfidence({ ...ocr, segments: slotSegments }), "invalid_processing");
  assert.equal(reads, 0);
  const locationAccessor = { ...citation, location: { ...citation.location } };
  Object.defineProperty(locationAccessor.location, "sectionLabel", {
    enumerable: true,
    get() {
      reads += 1;
      return "Results";
    },
  });
  expectContractError(() => normalizeMaterialCitation(locationAccessor, value), "invalid_input");
  assert.equal(reads, 0);

  const delivery = candidate({
    metadata: { ...candidate().metadata as object, sourceKind: "delivery_resume" },
  });
  const authorization = { ...DELIVERY_AUTH };
  Object.defineProperty(authorization, "materialIntent", {
    enumerable: true,
    get() {
      reads += 1;
      return true;
    },
  });
  expectContractError(() => normalizeMaterialAsset(delivery, authorization), "invalid_input");
  assert.equal(reads, 0);
});
test("relation planner accepts ordinary user text authorization", () => {
  const value = normalizeMaterialAsset(candidate({
    metadata: { ...candidate().metadata as object, mediaKind: "text", sourceKind: "user_text" },
  }));
  const proposal = planMaterialRelationProposal({
    proposalId: "proposal_user_text",
    preparedAt: NOW,
    classification: "unclassified",
    material: value,
    experienceReferences: [],
  }, { sourceKind: "user_text", materialIntent: false });
  assert.equal(proposal.sourceKind, "user_text");
  assert.deepEqual(validateMaterialRelationProposal(proposal, { sourceKind: "user_text", materialIntent: false }), []);
});
test("rejects invalid relation classifications before proposal output", () => {
  const value = asset();
  const plan = {
    proposalId: "proposal_invalid_classification",
    preparedAt: NOW,
    material: value,
    experienceReferences: [],
  };
  expectContractError(() => planMaterialRelationProposal({
    ...plan,
    classification: "bogus",
  } as unknown as Parameters<typeof planMaterialRelationProposal>[0]), "invalid_enum");
  expectContractError(() => planMaterialRelationProposal({
    ...plan,
    classification: { rawText: "secret" },
  } as unknown as Parameters<typeof planMaterialRelationProposal>[0]), "invalid_enum");
});

test("relation validator rejects accessor fields without invoking them", () => {
  const value = asset();
  const proposal = planMaterialRelationProposal({
    proposalId: "proposal_validator_accessor",
    preparedAt: NOW,
    classification: "unclassified",
    material: value,
    experienceReferences: [],
  });
  let reads = 0;
  Object.defineProperty(proposal, "materialHash", {
    enumerable: true,
    get() {
      reads += 1;
      return value.identity.contentHash;
    },
  });
  assert.notDeepEqual(validateMaterialRelationProposal(proposal, USER_UPLOAD_AUTH), []);
  assert.equal(reads, 0);
});
