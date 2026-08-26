import assert from "node:assert/strict";
import test from "node:test";

import type { LocalResumeDraft } from "../src/resume/draft/types.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";
import { projectJobRepository } from "../src/job-assets/repository-projection.js";
import { ResumeLibraryService } from
  "../src/desktop/main/resume-library/resume-library-service.js";
import { repositoryJd } from "./support/job-repository-fixture.js";

test("resume library preserves a local draft JD for repository aggregation", async () => {
  const jd = repositoryJd("jd-local", "QA Draft Link");
  const draft: LocalResumeDraft = {
    schemaVersion: "local-resume-draft-v1",
    artifactId: "11111111-1111-4111-8111-111111111111",
    ownerId: "user-1",
    conversationIds: ["conversation-1"],
    title: "Data Engineer",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    workspace: {
      status: "needs_revision",
      sourceSnapshot: { jd: { id: jd.id, title: jd.title } },
    } as ResumeWorkspace,
    checkpoints: [],
    pendingChange: null,
    cloudLink: null,
  };
  const service = new ResumeLibraryService(
    { listResumes: async () => [], syncStatus: () => "clean" } as never,
    { list: async () => [draft] } as never,
  );

  const entries = await service.list();
  const snapshot = projectJobRepository({
    jds: [jd],
    resumes: entries,
    applications: [],
  });

  assert.equal(entries[0]?.local?.jdId, jd.id);
  assert.equal(entries[0]?.local?.jdTitle, jd.title);
  assert.equal(snapshot.resumes[0]?.primaryJd.state, "linked");
  assert.equal(snapshot.resumes[0]?.primaryJd.id, jd.id);
  assert.deepEqual(snapshot.jds[0]?.targetedResumeIds, [entries[0]?.entryId]);
});
