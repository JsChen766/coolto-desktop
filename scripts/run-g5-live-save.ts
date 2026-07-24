import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import type { ApprovalEvent } from "../src/approvals/types.js";
import { CooltoApiClient } from "../src/api/coolto-api-client.js";
import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import { getResumeFixture } from "../src/resume/fixtures.js";
import { createResumeSaveApprovalDraft } from "../src/resume/save/approval-draft.js";
import type { ResumeSaveApprovalPayload } from "../src/resume/save/types.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import {
  createLiveSavePayload,
  liveExperienceDefinitions,
  type CreatedLiveExperience,
} from "./support/g5-live-payload.js";

const email = requiredEnv("COOLTO_EMAIL");
const password = requiredEnv("COOLTO_PASSWORD");
const baseUrl = requiredEnv("COOLTO_API_BASE_URL");
const qaResultPath = requiredEnv("COOLTO_G5_QA_RESULT_PATH");
delete process.env.COOLTO_PASSWORD;

const client = new CooltoApiClient({ baseUrl });
const runLabel = new Date().toISOString().replace(/[:.]/g, "-");
try {
  await client.login({ email, password });
  const jd = (await client.listJds({ limit: 1 })).items[0];
  if (!jd) throw new Error("G5 live QA requires one owned JD");
  const source = getResumeFixture("zh-qualified");
  const definitions = liveExperienceDefinitions(source, runLabel);
  const created: CreatedLiveExperience[] = [];
  for (const definition of definitions) {
    created.push({
      itemId: definition.itemId,
      content: definition.input.content,
      experience: await client.createExperience(definition.input),
    });
  }
  const compileResult = await readQualifiedCompileResult(qaResultPath);
  const common = {
    source,
    compileResult,
    created,
    jdId: jd.id,
    targetRole: jd.targetRole,
  };
  const first = await approveSave(client, createLiveSavePayload({
    ...common,
    proposalId: `g5-live-${runLabel}-new`,
    title: `G5 LIVE QA ${runLabel}`,
    mode: "new_resume",
  }));
  const second = await approveSave(client, createLiveSavePayload({
    ...common,
    proposalId: `g5-live-${runLabel}-replace`,
    title: `G5 LIVE QA ${runLabel} v2`,
    mode: "replace_resume",
    resumeId: first.resumeId,
    expectedContentHash: first.contentHash,
  }));
  const appRead = await client.resumes.getResume(first.resumeId);
  const webRead = await readAsWeb(baseUrl, client.getSessionToken(), first.resumeId);
  assert.equal(appRead.contentHash, second.contentHash);
  assert.equal(webRead.contentHash, second.contentHash);
  assert.deepEqual(webRead.structured, appRead.structured);
  assert.ok(appRead.structured.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)
    .every((bullet) => bullet.source_evidence?.length));
  process.stdout.write(`${JSON.stringify({
    passed: true,
    resumeId: first.resumeId,
    firstContentHash: first.contentHash,
    currentContentHash: second.contentHash,
    createdSourceCount: created.length,
    usageRatio: compileResult.usageRatio,
    minimumBulletTailRatio: Math.min(...compileResult.bullets.map((item) => item.lastLineRatio)),
    webStructuredMatchesApp: true,
  }, null, 2)}\n`);
} finally {
  await client.logout().catch(() => undefined);
}

async function approveSave(client: CooltoApiClient, payload: ResumeSaveApprovalPayload) {
  const manager = createActionApprovalManager(
    client,
    new ExperienceImportProposalStore(),
    client.resumes,
  );
  let completed: ApprovalEvent | undefined;
  manager.subscribe((event) => {
    if (event.type === "approval.completed" || event.type === "approval.failed") completed = event;
  });
  const request = await manager.request(createResumeSaveApprovalDraft(payload), payload);
  await manager.resolve(request.id, { type: "accept" });
  if (!completed || completed.type !== "approval.completed") {
    const message = completed?.type === "approval.failed" ? completed.message : "no result";
    throw new Error(`G5 live approval failed: ${message}`);
  }
  return completed.details as { resumeId: string; contentHash: string };
}

async function readQualifiedCompileResult(path: string): Promise<ResumeCompileResult> {
  const report = JSON.parse(await readFile(path, "utf8")) as {
    compileResults: ResumeCompileResult[];
  };
  const result = report.compileResults.find((item) => item.fixtureId === "zh-qualified");
  if (!result?.qualified) throw new Error("Qualified Chromium result is missing");
  return result;
}

async function readAsWeb(baseUrl: string, token: string, resumeId: string) {
  const response = await fetch(`${baseUrl}/v1/product/resumes/${resumeId}`, {
    headers: { cookie: `access_token=${token}` },
  });
  const body = await response.json() as { success: boolean; data: unknown };
  assert.equal(response.ok && body.success, true);
  return body.data as Awaited<ReturnType<CooltoApiClient["resumes"]["getResume"]>>;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
