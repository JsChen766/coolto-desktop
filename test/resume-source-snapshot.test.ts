import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExperienceDetail,
  JdRecord,
  UserProfile,
} from "../src/api/types.js";
import {
  EvidenceLedger,
  EvidenceValidationError,
} from "../src/resume/evidence-ledger.js";
import { projectResumeSourceSnapshot } from "../src/resume/source-projection.js";
import {
  ResumeSourceSnapshotBuilder,
  ResumeSourceSnapshotError,
} from "../src/resume/source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../src/resume/source-types.js";

const CONTENT =
  "使用 Python 清洗运营数据，并为 3 个团队建立周度报表。随后设计异常检查规则。";

test("source snapshot locks current revision content with a deterministic fingerprint", async () => {
  const first = await createBuilder("2026-07-23T00:00:00.000Z").build(input);
  const second = await createBuilder("2026-07-24T00:00:00.000Z").build(input);

  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.notEqual(first.capturedAt, second.capturedAt);
  assert.equal(first.experiences[0]?.revisionId, "rev-1");
  assert.equal(first.experiences[0]?.content, CONTENT);
  assert.equal(first.jd.requirements[0]?.id, "req-1");
  assert.equal(first.template.profileHash, STANDARD_RESUME_TEMPLATE_SNAPSHOT.profileHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.experiences), true);
  assert.equal(Object.isFrozen(first.experiences[0]), true);

  const projection = projectResumeSourceSnapshot(first);
  const serializedProjection = JSON.stringify(projection);
  assert.match(serializedProjection, /revisionContentHash/);
  assert.match(serializedProjection, /availableEvidence/);
  assert.match(serializedProjection, /evidenceId/);
  assert.match(serializedProjection, /sourceQuote/);
  assert.doesNotMatch(serializedProjection, /sourceStart/);
  assert.doesNotMatch(serializedProjection, /valueScore/);
  assert.doesNotMatch(serializedProjection, /revisionHistory/);
});

test("source fingerprint is independent from selected experience order", async () => {
  const firstExperience = createExperience();
  const secondExperience = withExperienceIdentity(createExperience(), "exp-2", "rev-2");
  const builder = createBuilderFromExperiences([firstExperience, secondExperience]);

  const first = await builder.build({
    ...input,
    experienceIds: ["exp-1", "exp-2"],
  });
  const second = await builder.build({
    ...input,
    experienceIds: ["exp-2", "exp-1"],
  });

  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.deepEqual(
    first.experiences.map((experience) => experience.id),
    ["exp-1", "exp-2"],
  );
});

test("snapshot builder fails closed on duplicate IDs and revision drift", async () => {
  await assert.rejects(
    createBuilder().build({ ...input, experienceIds: ["exp-1", "exp-1"] }),
    (error: unknown) =>
      error instanceof ResumeSourceSnapshotError &&
      error.code === "duplicate_experience_id",
  );

  const drifted = createExperience();
  drifted.currentRevisionId = "rev-new";
  await assert.rejects(
    createBuilder(undefined, drifted).build(input),
    (error: unknown) =>
      error instanceof ResumeSourceSnapshotError &&
      error.code === "current_revision_mismatch",
  );
});

test("resume generation names every missing required confirmed Profile field", async () => {
  const profile = createProfile();
  profile.fullName = null;
  profile.contactEmail = null;
  const builder = createBuilderWithProfile(profile);
  await assert.rejects(
    builder.build(input),
    (error: unknown) => error instanceof ResumeSourceSnapshotError &&
      error.code === "missing_required_profile_fields" &&
      error.message === "Resume generation requires: fullName, contactEmail.",
  );
});

test("source evidence allows pending but rejects conflict and failed experiences", async () => {
  const pending = createExperience();
  pending.syncStatus = "pending";
  const snapshot = await createBuilder(undefined, pending).build(input);
  assert.equal(snapshot.experiences[0]?.revisionId, "rev-1");

  for (const status of ["conflict", "failed"] as const) {
    const blocked = createExperience();
    blocked.syncStatus = status;
    await assert.rejects(
      createBuilder(undefined, blocked).build(input),
      (error: unknown) =>
        error instanceof ResumeSourceSnapshotError &&
        error.code === "inactive_experience",
    );
  }
});

test("evidence ledger accepts exact current-revision quotes", async () => {
  const snapshot = await buildSnapshot();
  const ledger = new EvidenceLedger(snapshot);
  const binding = createBinding(snapshot, "bullet-1", 0, CONTENT.indexOf("。") + 1);

  ledger.reserve(binding);
  assert.equal(ledger.listBindings().length, 1);
  assert.equal(ledger.sourceFingerprint, snapshot.sourceFingerprint);
  assert.deepEqual(
    ledger.validateCandidate({
      sourceFingerprint: snapshot.sourceFingerprint,
      bullets: [binding],
    }),
    [],
  );
  assert.equal(ledger.release("bullet-1"), true);
  assert.equal(ledger.listBindings().length, 0);
});

test("evidence ledger rejects stale, overlapping, and fabricated numeric evidence", async () => {
  const snapshot = await buildSnapshot();
  const ledger = new EvidenceLedger(snapshot);
  const first = createBinding(snapshot, "bullet-1", 0, CONTENT.indexOf("。") + 1);
  ledger.reserve(first);

  assert.throws(
    () => ledger.reserve(createBinding(snapshot, "bullet-2", 5, 20)),
    (error: unknown) =>
      error instanceof EvidenceValidationError &&
      error.code === "duplicate_source_range",
  );

  const fabricated = createBinding(
    snapshot,
    "bullet-3",
    CONTENT.indexOf("随后"),
    CONTENT.length,
  );
  fabricated.bulletText = "将异常率降低 50%";
  assert.throws(
    () => ledger.reserve(fabricated),
    (error: unknown) =>
      error instanceof EvidenceValidationError &&
      error.code === "unsupported_numeric_claim",
  );

  const stale = createBinding(
    snapshot,
    "bullet-4",
    CONTENT.indexOf("随后"),
    CONTENT.length,
  );
  stale.excerpts[0]!.revisionContentHash = "stale";
  assert.throws(
    () => ledger.reserve(stale),
    (error: unknown) =>
      error instanceof EvidenceValidationError &&
      error.code === "excerpt_revision_mismatch",
  );
});

test("failed evidence replacement restores the previous binding", async () => {
  const snapshot = await buildSnapshot();
  const ledger = new EvidenceLedger(snapshot);
  const valid = createBinding(snapshot, "bullet-1", 0, CONTENT.indexOf("。") + 1);
  ledger.reserve(valid);

  const invalid = structuredClone(valid);
  invalid.excerpts[0]!.sourceQuote = "不存在的原文";
  assert.throws(() => ledger.replaceBinding(invalid), EvidenceValidationError);
  assert.deepEqual(ledger.listBindings(), [valid]);
});

test("evidence ledger rejects blank and whitespace-aliased bullet IDs", async () => {
  const snapshot = await buildSnapshot();
  const ledger = new EvidenceLedger(snapshot);

  assert.throws(
    () => ledger.reserve(createBinding(snapshot, "   ", 0, 5)),
    (error: unknown) =>
      error instanceof EvidenceValidationError &&
      error.code === "invalid_bullet_id",
  );

  ledger.reserve(createBinding(snapshot, "bullet-1", 0, 5));
  assert.throws(
    () =>
      ledger.reserve(
        createBinding(snapshot, " bullet-1 ", CONTENT.indexOf("随后"), CONTENT.length),
      ),
    (error: unknown) =>
      error instanceof EvidenceValidationError &&
      error.code === "duplicate_bullet_id",
  );
  assert.equal(ledger.release(" bullet-1 "), true);
});

const input = {
  jdId: "jd-1",
  experienceIds: ["exp-1"],
  template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
} as const;

function createBuilder(
  now = "2026-07-23T00:00:00.000Z",
  experience = createExperience(),
): ResumeSourceSnapshotBuilder {
  return createBuilderFromExperiences([experience], now);
}

function createBuilderFromExperiences(
  experiences: ExperienceDetail[],
  now = "2026-07-23T00:00:00.000Z",
): ResumeSourceSnapshotBuilder {
  const byId = new Map(experiences.map((experience) => [experience.id, experience]));
  return new ResumeSourceSnapshotBuilder(
    {
      currentUser: {
        getCurrentUser: async () => ({
          id: "user-1",
          email: "alice@example.com",
        }),
      },
      profile: { getUserProfile: async () => createProfile() },
      jd: {
        listJds: async () => ({ items: [createJd()], nextCursor: null }),
        getJd: async () => createJd(),
      },
      experience: {
        searchExperiences: async () => ({ items: experiences, nextCursor: null }),
        getExperience: async (experienceId) => {
          const experience = byId.get(experienceId);
          if (!experience) throw new Error(`Missing test experience ${experienceId}`);
          return experience;
        },
      },
    },
    { now: () => new Date(now) },
  );
}

function createBuilderWithProfile(profile: UserProfile): ResumeSourceSnapshotBuilder {
  const experience = createExperience();
  return new ResumeSourceSnapshotBuilder({
    currentUser: { getCurrentUser: async () => ({ id: "user-1", email: "login@example.com" }) },
    profile: { getUserProfile: async () => profile },
    jd: { listJds: async () => ({ items: [createJd()], nextCursor: null }), getJd: async () => createJd() },
    experience: {
      searchExperiences: async () => ({ items: [experience], nextCursor: null }),
      getExperience: async () => experience,
    },
  });
}

function withExperienceIdentity(
  experience: ExperienceDetail,
  experienceId: string,
  revisionId: string,
): ExperienceDetail {
  const copy = structuredClone(experience);
  copy.id = experienceId;
  copy.currentRevisionId = revisionId;
  if (copy.currentRevision) {
    copy.currentRevision.id = revisionId;
    copy.currentRevision.experienceId = experienceId;
  }
  for (const revision of copy.revisions) {
    revision.id = revisionId;
    revision.experienceId = experienceId;
  }
  return copy;
}

async function buildSnapshot(): Promise<ResumeSourceSnapshot> {
  return createBuilder().build(input);
}

function createProfile(): UserProfile {
  return {
    fullName: "Alice Chen",
    contactEmail: "resume@example.com",
    email: "alice@example.com",
    phone: "+852 1234 5678",
    location: "Hong Kong",
    linkedinUrl: null,
    githubUrl: null,
    personalWebsite: null,
    currentTitle: null,
    currentCompany: null,
    yearsOfExperience: 2,
    careerStage: "early_career",
    targetRoles: [],
    targetIndustries: [],
    targetLocations: [],
    preferredLanguage: "zh-CN",
    resumeStyle: "standard",
  };
}

function createJd(): JdRecord {
  return {
    id: "jd-1",
    title: "数据产品经理",
    company: "Example",
    targetRole: "产品经理",
    rawText: "需要数据产品经验和跨团队协作能力。",
    requirements: [
      {
        id: "req-1",
        text: "具备数据产品经验",
        category: "domain",
        importance: "high",
        keywords: ["数据产品"],
        weight: 0.9,
        v2Importance: "must_have",
        v2Category: "domain",
      },
    ],
    jdHash: "server-jd-hash",
    requirementMapId: "map-1",
    requirementsOrigin: "parsed",
    sourceThreadId: null,
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  };
}

function createExperience(): ExperienceDetail {
  const revision = {
    id: "rev-1",
    experienceId: "exp-1",
    content: CONTENT,
    source: "manual",
    revisionHash: "server-revision-hash",
    factBankStatus: "ready",
    createdAt: "2026-07-01T00:00:00Z",
  };
  return {
    id: "exp-1",
    category: "work",
    title: "数据分析实习生",
    organization: "Example",
    role: "数据团队",
    location: "香港",
    startDate: "2026-01",
    endDate: "2026-06",
    tags: ["Python"],
    status: "active",
    currentRevisionId: revision.id,
    currentRevision: revision,
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    revisions: [revision],
  };
}

function createBinding(
  snapshot: ResumeSourceSnapshot,
  bulletId: string,
  sourceStart: number,
  sourceEnd: number,
): BulletEvidenceBinding {
  const experience = snapshot.experiences[0]!;
  return {
    bulletId,
    sourceExperienceId: experience.id,
    bulletText: experience.content.slice(sourceStart, sourceEnd),
    excerpts: [
      {
        experienceId: experience.id,
        revisionId: experience.revisionId,
        revisionContentHash: experience.contentHash,
        sourceStart,
        sourceEnd,
        sourceQuote: experience.content.slice(sourceStart, sourceEnd),
      },
    ],
    matchedRequirementIds: ["req-1"],
  };
}
