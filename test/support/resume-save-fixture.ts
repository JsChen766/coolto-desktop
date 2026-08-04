import { ResumeQualityEvaluator } from "../../src/resume/quality/quality-evaluator.js";
import { ResumeCandidateReviewer } from "../../src/resume/quality/candidate-reviewer.js";
import { ResumeSaveProposalBuilder } from "../../src/resume/save/proposal-builder.js";
import { allEvidenceCandidates } from "../../src/resume/quality/evidence-candidates.js";
import type { ResumeSourceSnapshot } from "../../src/resume/source-types.js";
import { ResumeCandidatePreparer } from "../../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceStore } from "../../src/resume/workspace/workspace-store.js";
import type { EvidenceBindingInput } from "../../src/resume/workspace/types.js";
import {
  FixtureResumeCompiler,
  WORK_CONTENT,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./resume-workspace-fixture.js";

export async function createReadySaveFixture() {
  const sourceBuilder = createWorkspaceSnapshotBuilder();
  const snapshot = await sourceBuilder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: {
      templateId: "resume-standard",
      profileVersion: "resume-template-v2",
      profileHash: "130b516b3eb2f0a5a335ff525eebd3ca43dcce1053ab02a06d384e3a18f09fc0",
    },
  });
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(
    sourceBuilder,
    new FixtureResumeCompiler(),
    store,
    { createCandidateId: () => "candidate-save" },
  );
  const prepared = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
    initialBindings: [
      educationBinding(snapshot),
      createBinding(snapshot, "bullet-work", WORK_CONTENT.split("。")[0] + "。"),
    ],
  });
  const reviewer = new ResumeCandidateReviewer(
    new ResumeQualityEvaluator(),
    store,
  );
  const ready = reviewer.review(prepared.candidateId, prepared.revision);
  return {
    store,
    ready,
    proposalBuilder: new ResumeSaveProposalBuilder(store),
  };
}

function educationBinding(snapshot: ResumeSourceSnapshot): EvidenceBindingInput {
  const source = snapshot.experiences.find((item) => item.id === "edu-1")!;
  return {
    bulletText: source.content,
    evidenceIds: allEvidenceCandidates(snapshot)
      .filter((candidate) => candidate.experienceId === source.id)
      .map((candidate) => candidate.evidenceId),
  };
}
