import assert from "node:assert/strict";
import test from "node:test";

import type { LocalResumeDraft, ResumeDraftArtifactReference } from
  "../src/resume/draft/types.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { restoreLatestInProgressResume } from
  "../src/desktop/main/resume-drafts/resume-conversation-restorer.js";
import { localDraftContentHash } from
  "../src/resume/reuse/local-draft-source.js";
import { sha256, stableStringify } from
  "../src/resume/stable-snapshot.js";

test("conversation restart restores the latest unfinished Resume workspace", async () => {
  const store = new ResumeWorkspaceStore();
  const artifacts: ResumeDraftArtifactReference[] = [
    reference("ready", "ready_for_approval"),
    reference("unfinished", "needs_user_decision"),
  ];
  const workspace = { candidateId: "candidate-restored", revision: 12 } as
    ResumeWorkspace;
  const requested: string[] = [];
  const artifactIdByCandidate = new Map<string, string>();
  const restored = await restoreLatestInProgressResume(
    artifacts,
    {
      get: async (artifactId) => {
        requested.push(artifactId);
        return { artifactId, workspace } as LocalResumeDraft;
      },
    },
    { workspaceStore: store, artifactIdByCandidate },
  );

  assert.equal(restored, true);
  assert.deepEqual(requested, ["unfinished"]);
  assert.equal(store.latest()?.candidateId, "candidate-restored");
  assert.equal(artifactIdByCandidate.get("candidate-restored"), "unfinished");
});

test("completed Resume artifacts do not silently activate on restart", async () => {
  const store = new ResumeWorkspaceStore();
  const restored = await restoreLatestInProgressResume(
    [reference("ready", "ready_for_approval")],
    { get: async () => { throw new Error("must not load"); } },
    { workspaceStore: store, artifactIdByCandidate: new Map() },
  );
  assert.equal(restored, false);
  assert.equal(store.latest(), undefined);
});

test("restart rereads the current JD and Experiences before restoring", async () => {
  const store = new ResumeWorkspaceStore();
  const sourceSnapshot = resumeSourceSnapshot("current");
  const workspace = {
    candidateId: "candidate-restored",
    revision: 12,
    sourceSnapshot,
  } as ResumeWorkspace;
  const reads: string[] = [];
  const restored = await restoreLatestInProgressResume(
    [reference("unfinished", "needs_user_decision")],
    {
      get: async (artifactId) => ({ artifactId, workspace }) as LocalResumeDraft,
    },
    {
      workspaceStore: store,
      artifactIdByCandidate: new Map(),
      sourceBuilder: {
        build: async (input: { jdId: string; experienceIds: string[] }) => {
          reads.push(`${input.jdId}:${input.experienceIds.join(",")}`);
          return sourceSnapshot;
        },
      },
    } as never,
  );

  assert.equal(restored, true);
  assert.deepEqual(reads, ["jd-1:exp-1"]);
  assert.equal(store.latest()?.candidateId, "candidate-restored");
});

test("restart restores a Resume when Profile and Preference binding is unchanged", async () => {
  const store = new ResumeWorkspaceStore();
  const binding = {
    profileEntityVersion: 4, profileLocalVersion: 2, preferenceResolutionHash: "a".repeat(64),
    targetFingerprint: "b".repeat(64),
    explainability: { appliedKeys: ["resume.tone"], overriddenCount: 1, conflictCount: 0 },
  };
  const workspace = {
    candidateId: "candidate-bound", revision: 3,
    sourceSnapshot: resumeSourceSnapshot("current"),
    profilePreferenceBinding: binding,
  } as ResumeWorkspace;
  const restored = await restoreLatestInProgressResume(
    [reference("bound", "needs_user_decision")],
    { get: async (artifactId) => ({ artifactId, workspace }) as LocalResumeDraft },
    {
      workspaceStore: store, artifactIdByCandidate: new Map(),
      sourceBuilder: { build: async () => workspace.sourceSnapshot },
      profilePreferenceContext: async () => binding,
    } as never,
  );
  assert.equal(restored, true);
  assert.equal(store.latest()?.profilePreferenceBinding?.preferenceResolutionHash, "a".repeat(64));
});

test("restart refuses a Resume when the local Profile projection drifted", async () => {
  const store = new ResumeWorkspaceStore();
  const persisted = {
    profileEntityVersion: 4, profileLocalVersion: 2, preferenceResolutionHash: "a".repeat(64),
    targetFingerprint: null,
    explainability: { appliedKeys: [], overriddenCount: 0, conflictCount: 0 },
  };
  const current = { ...persisted, profileLocalVersion: 3 };
  const workspace = {
    candidateId: "candidate-local-profile-drift", revision: 3,
    sourceSnapshot: resumeSourceSnapshot("current"),
    profilePreferenceBinding: persisted,
  } as unknown as ResumeWorkspace;
  const restored = await restoreLatestInProgressResume(
    [reference("local-profile-drift", "needs_user_decision")],
    { get: async (artifactId) => ({ artifactId, workspace }) as LocalResumeDraft },
    {
      workspaceStore: store, artifactIdByCandidate: new Map(),
      sourceBuilder: { build: async () => workspace.sourceSnapshot },
      profilePreferenceContext: async () => current,
    } as never,
  );
  assert.equal(restored, false);
  assert.equal(store.latest(), undefined);
});

test("restart refuses a legacy binding when local Profile authority is available", async () => {
  const store = new ResumeWorkspaceStore();
  const persisted = {
    profileEntityVersion: 4, preferenceResolutionHash: "a".repeat(64),
    targetFingerprint: null,
    explainability: { appliedKeys: [], overriddenCount: 0, conflictCount: 0 },
  };
  const current = { ...persisted, profileLocalVersion: 1 };
  const workspace = {
    candidateId: "candidate-legacy-profile-binding", revision: 3,
    sourceSnapshot: resumeSourceSnapshot("current"),
    profilePreferenceBinding: persisted,
  } as unknown as ResumeWorkspace;
  const restored = await restoreLatestInProgressResume(
    [reference("legacy-profile-binding", "needs_user_decision")],
    { get: async (artifactId) => ({ artifactId, workspace }) as LocalResumeDraft },
    {
      workspaceStore: store, artifactIdByCandidate: new Map(),
      sourceBuilder: { build: async () => workspace.sourceSnapshot },
      profilePreferenceContext: async () => current,
    } as never,
  );
  assert.equal(restored, false);
  assert.equal(store.latest(), undefined);
});

test("restart refuses a Resume when the primary career target fingerprint drifted", async () => {
  const store = new ResumeWorkspaceStore();
  const persisted = {
    profileEntityVersion: 4, preferenceResolutionHash: "a".repeat(64),
    targetFingerprint: "b".repeat(64),
    explainability: { appliedKeys: [], overriddenCount: 0, conflictCount: 0 },
  };
  const current = { ...persisted, targetFingerprint: "c".repeat(64) };
  const workspace = {
    candidateId: "candidate-target-drift", revision: 3,
    sourceSnapshot: resumeSourceSnapshot("current"),
    profilePreferenceBinding: persisted,
  } as unknown as ResumeWorkspace;
  const restored = await restoreLatestInProgressResume(
    [reference("target-drift", "needs_user_decision")],
    { get: async (artifactId) => ({ artifactId, workspace }) as LocalResumeDraft },
    {
      workspaceStore: store, artifactIdByCandidate: new Map(),
      sourceBuilder: { build: async () => workspace.sourceSnapshot },
      profilePreferenceContext: async () => current,
    } as never,
  );
  assert.equal(restored, false);
  assert.equal(store.latest(), undefined);
});

test("restart refuses a draft when the current source fingerprint drifted", async () => {
  const store = new ResumeWorkspaceStore();
  const workspace = {
    candidateId: "candidate-stale",
    revision: 12,
    sourceSnapshot: resumeSourceSnapshot("persisted"),
  } as ResumeWorkspace;
  const restored = await restoreLatestInProgressResume(
    [reference("stale", "needs_user_decision")],
    {
      get: async (artifactId) => ({ artifactId, workspace }) as LocalResumeDraft,
    },
    {
      workspaceStore: store,
      artifactIdByCandidate: new Map(),
      sourceBuilder: {
        build: async () => resumeSourceSnapshot("current"),
      },
    } as never,
  );

  assert.equal(restored, false);
  assert.equal(store.latest(), undefined);
});

test("restart rereads a reused cloud Resume before restoring", async () => {
  const store = new ResumeWorkspaceStore();
  const sourceSnapshot = resumeSourceSnapshot("current");
  const workspace = {
    candidateId: "candidate-cloud-base",
    revision: 12,
    sourceSnapshot,
    reuseBase: {
      kind: "cloud",
      resumeId: "resume-base",
      sourceJdId: "jd-old",
      contentHash: "persisted-resume-hash",
      retainedBulletCount: 1,
      droppedBulletCount: 0,
    },
  } as ResumeWorkspace;
  let resumeReads = 0;
  const restored = await restoreLatestInProgressResume(
    [reference("cloud-base", "needs_user_decision")],
    {
      get: async (artifactId) => ({ artifactId, workspace }) as LocalResumeDraft,
    },
    {
      workspaceStore: store,
      artifactIdByCandidate: new Map(),
      sourceBuilder: {
        build: async () => sourceSnapshot,
      },
      resumeReader: {
        getResume: async () => {
          resumeReads += 1;
          return { contentHash: "current-resume-hash" } as never;
        },
      },
    } as never,
  );

  assert.equal(restored, false);
  assert.equal(resumeReads, 1);
  assert.equal(store.latest(), undefined);
});

test("restart refuses a reused local Resume when its hash drifted", async () => {
  const store = new ResumeWorkspaceStore();
  const sourceSnapshot = resumeSourceSnapshot("current");
  const fixture = compositeRestoreFixture("unused");
  const workspace = {
    candidateId: "candidate-local-base",
    revision: 12,
    sourceSnapshot,
    reuseBase: {
      kind: "local",
      resumeId: "draft-local",
      sourceJdId: "jd-old",
      contentHash: "persisted-local-hash",
      retainedBulletCount: 1,
      droppedBulletCount: 0,
    },
  } as unknown as ResumeWorkspace;
  const restored = await restoreLatestInProgressResume(
    [reference("local-base", "needs_user_decision")],
    {
      get: async (artifactId) => ({ artifactId, workspace }) as LocalResumeDraft,
      getReusableDraft: async () => fixture.localDraft,
    },
    {
      workspaceStore: store,
      artifactIdByCandidate: new Map(),
      sourceBuilder: { build: async () => sourceSnapshot },
    } as never,
  );

  assert.equal(restored, false);
  assert.equal(store.latest(), undefined);
});

test("restart rereads every source in a composite reused Resume", async () => {
  const store = new ResumeWorkspaceStore();
  const sourceSnapshot = resumeSourceSnapshot("current");
  const fixture = compositeRestoreFixture("cloud-current");
  const reads: string[] = [];
  let localReads = 0;
  const restored = await restoreLatestInProgressResume(
    [reference("composite", "needs_user_decision")],
    {
      get: async (artifactId) => ({
        artifactId,
        workspace: { ...fixture.workspace, sourceSnapshot },
      }) as LocalResumeDraft,
      getReusableDraft: async () => {
        localReads += 1;
        return fixture.localDraft;
      },
    },
    {
      workspaceStore: store,
      artifactIdByCandidate: new Map(),
      sourceBuilder: { build: async () => sourceSnapshot },
      resumeReader: {
        getResume: async (resumeId: string) => {
          reads.push(`cloud:${resumeId}`);
          return {
            contentHash: "cloud-current",
            updatedAt: "2026-09-08T00:00:00.000Z",
          } as never;
        },
      },
    } as never,
  );

  assert.equal(restored, true);
  assert.deepEqual(reads, ["cloud:resume-cloud"]);
  assert.equal(localReads, 1);
  assert.equal(store.latest()?.candidateId, "candidate-composite");
});

test("restart refuses a composite Resume when one source drifted", async () => {
  const store = new ResumeWorkspaceStore();
  const sourceSnapshot = resumeSourceSnapshot("current");
  const fixture = compositeRestoreFixture("cloud-persisted");
  const restored = await restoreLatestInProgressResume(
    [reference("composite-stale", "needs_user_decision")],
    {
      get: async (artifactId) => ({
        artifactId,
        workspace: { ...fixture.workspace, sourceSnapshot },
      }) as LocalResumeDraft,
      getReusableDraft: async () => fixture.localDraft,
    },
    {
      workspaceStore: store,
      artifactIdByCandidate: new Map(),
      sourceBuilder: { build: async () => sourceSnapshot },
      resumeReader: {
        getResume: async () => ({
          contentHash: "cloud-current",
          updatedAt: "2026-09-08T00:00:00.000Z",
        }) as never,
      },
    } as never,
  );

  assert.equal(restored, false);
  assert.equal(store.latest(), undefined);
});

function resumeSourceSnapshot(sourceFingerprint: string) {
  return {
    schemaVersion: "resume-source-snapshot-v1",
    generationStrategy: "tailored",
    capturedAt: "2026-09-08T00:00:00.000Z",
    sourceFingerprint,
    profile: {},
    jd: { id: "jd-1" },
    experiences: [{ id: "exp-1" }],
    template: {},
  } as unknown as ResumeWorkspace["sourceSnapshot"];
}

function compositeRestoreFixture(cloudHash: string) {
  const localDraft = {
    updatedAt: "2026-09-08T00:00:00.000Z",
    workspace: {
      revision: 4,
      structure: { sections: [] },
      bindings: [],
    },
  } as unknown as LocalResumeDraft;
  const sources = [
    {
      experienceId: "exp-cloud",
      kind: "cloud" as const,
      sourceId: "resume-cloud",
      updatedAt: "2026-09-08T00:00:00.000Z",
    },
    {
      experienceId: "exp-local",
      kind: "local" as const,
      sourceId: "draft-local",
      updatedAt: "2026-09-08T00:00:00.000Z",
    },
  ];
  return {
    localDraft,
    workspace: {
      candidateId: "candidate-composite",
      revision: 12,
      reuseBase: {
        kind: "composite" as const,
        resumeId: "user-directed-composite",
        sourceJdId: null,
        contentHash: sha256(stableStringify(sources.map((source) => ({
          ...source,
          contentHash: source.kind === "cloud"
            ? cloudHash
            : localDraftContentHash(localDraft),
        })))),
        retainedBulletCount: 1,
        droppedBulletCount: 0,
        sources,
      },
    } as unknown as ResumeWorkspace,
  };
}

function reference(
  artifactId: string,
  workspaceStatus: NonNullable<ResumeDraftArtifactReference["workspaceStatus"]>,
): ResumeDraftArtifactReference {
  return {
    artifactId,
    checkpointId: null,
    title: artifactId,
    createdAt: "2026-08-26T00:00:00Z",
    workspaceStatus,
  };
}
