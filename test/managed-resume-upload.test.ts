import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { ManagedResumeUploadService } from
  "../src/desktop/main/agent-task/managed-resume-upload-service.js";

test("managed Resume PDF stays host-only and is removed with its task", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-upload-test-"));
  try {
    const harness = new AgentHarnessServices(
      "owner", new AgentHarnessStateRepository(
        "owner", new MemoryAgentHarnessStatePersistence(),
      ),
    );
    const task = await harness.tasks.create("conversation", "Apply with Resume");
    const now = Date.now();
    await harness.grants.create({
      ownerId: "owner", taskId: task.id, taskGoalHash: task.goalHash,
      allowedDomains: ["jobs.example"], blockedDomains: [],
      allowedActions: ["browser.write", "task.lifecycle"],
      jobCriteria: { loopKind: "resume_job_apply" },
      assetPolicy: {
        resumeId: "resume-1", resumeTitle: "Backend Resume",
        resumeContentHash: "a".repeat(64), submissionMode: "confirm_each",
      },
      answerPolicy: {}, submissionBudget: {}, unattended: true,
      validFrom: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be7.2",
      confirmedByUserAt: new Date(now).toISOString(),
    });
    await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
    let uploadedPath = "";
    const service = new ManagedResumeUploadService(
      root, "owner", harness,
      { getResume: async () => ({
        id: "resume-1", title: "Backend Resume", status: "active",
        qualityStatus: "passed", contentHash: "a".repeat(64),
        structured: { language: "en", contact: null, sections: [] },
      }) } as never,
      { compileForPdf: async () => ({
        result: { qualified: true, pageCount: 1 },
        pdf: new Uint8Array([37, 80, 68, 70]),
      }) } as never,
      { uploadFile: async (_fillId: string, paths: readonly string[]) => {
        uploadedPath = paths[0]!;
        assert.deepEqual([...await readFile(uploadedPath)], [37, 80, 68, 70]);
        return { cancelled: false, filenames: ["Backend Resume.pdf"] };
      } } as never,
    );
    const result = await service.upload("conversation", "resume-file");
    assert.equal(result.uploaded, true);
    assert.equal(result.filename, "Backend Resume.pdf");
    assert.equal("path" in result, false);
    await access(uploadedPath);
    await service.cleanupTask(task.id);
    await assert.rejects(access(uploadedPath));
    await assert.rejects(
      service.upload("other-conversation", "resume-file"),
      /running AgentTask/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
