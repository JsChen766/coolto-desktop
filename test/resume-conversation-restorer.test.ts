import assert from "node:assert/strict";
import test from "node:test";

import type { LocalResumeDraft, ResumeDraftArtifactReference } from
  "../src/resume/draft/types.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { restoreLatestInProgressResume } from
  "../src/desktop/main/resume-drafts/resume-conversation-restorer.js";

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
