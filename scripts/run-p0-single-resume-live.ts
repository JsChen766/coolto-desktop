import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { CooltoApiClient, CooltoApiError } from "../src/api/coolto-api-client.js";
import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import { getResumeFixture } from "../src/resume/fixtures.js";
import { createResumeSaveApprovalDraft } from "../src/resume/save/approval-draft.js";
import type { ResumeSaveApprovalPayload } from "../src/resume/save/types.js";
import type { ResumeFull } from "../src/resume/types.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import {
  createLiveSavePayload,
  liveExperienceDefinitions,
  type CreatedLiveExperience,
} from "./support/g5-live-payload.js";

class HttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

const baseUrl = requiredEnv("COOLTO_API_BASE_URL").replace(/\/+$/u, "");
const qaResultPath = requiredEnv("COOLTO_G5_QA_RESULT_PATH");
const runId = randomUUID();
const runLabel = new Date().toISOString().replace(/[:.]/gu, "-");
const email = `p0-single-resume-${runId}@example.invalid`;
const password = `P0-${randomUUID()}!aA7`;

const registration = await fetchJson<{ userId: string; email: string }>(
  "/v1/auth/register",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  },
);
const accessToken = extractAccessToken(registration.response.headers);
assert.ok(accessToken, "registration must return an access_token cookie");

const client = new CooltoApiClient({ baseUrl });
client.restoreSession(accessToken);

const source = getResumeFixture("zh-qualified");
const compileResult = await readQualifiedCompileResult(qaResultPath);
const jd = await webRequest<{
  id: string;
  targetRole: string | null;
}>(
  accessToken,
  "/v1/product/jds",
  {
    method: "POST",
    body: {
      title: `P0 单文档实测 JD ${runLabel}`,
      company: "Coolto QA",
      target_role: "高级产品工程师",
      raw_text:
        "负责可靠的全栈产品交付、跨端数据一致性和自动化质量保障；要求具备 TypeScript、Python、PostgreSQL 与端到端测试经验。",
      requirements: [
        {
          text: "保障 App、Web 与后端数据一致性",
          category: "responsibility",
          importance: "high",
          keywords: ["App", "Web", "数据一致性"],
        },
        {
          text: "具备 TypeScript、Python 和 PostgreSQL 经验",
          category: "skill",
          importance: "high",
          keywords: ["TypeScript", "Python", "PostgreSQL"],
        },
      ],
    },
  },
);

const created: CreatedLiveExperience[] = [];
for (const definition of liveExperienceDefinitions(source, runLabel)) {
  created.push({
    itemId: definition.itemId,
    content: definition.input.content,
    experience: await client.createExperience(definition.input),
  });
}
assert.ok(created.length > 0);

const initialPayload = createLiveSavePayload({
  source,
  compileResult,
  created,
  jdId: jd.id,
  targetRole: jd.targetRole,
  proposalId: `p0-live-${runId}-app-create`,
  title: `P0 单文档实测简历 ${runLabel}`,
  mode: "new_resume",
});
const appCreated = await approveSave(client, initialPayload);
const appReadAfterCreate = await client.resumes.getResume(appCreated.resumeId);
const webReadAfterCreate = await webRequest<ResumeFull>(
  accessToken,
  `/v1/product/resumes/${encodeURIComponent(appCreated.resumeId)}`,
);
assert.equal(webReadAfterCreate.contentHash, appReadAfterCreate.contentHash);
assert.deepEqual(webReadAfterCreate.structured, appReadAfterCreate.structured);

const webStructured = structuredClone(webReadAfterCreate.structured);
const editedBullet = webStructured.sections
  .flatMap((section) => section.items)
  .flatMap((item) => item.bullets)[0];
assert.ok(editedBullet);
editedBullet.text = `${editedBullet.text}（Web 人工校订）`;

const webSaved = await webRequest<ResumeFull>(
  accessToken,
  `/v1/product/resumes/${encodeURIComponent(appCreated.resumeId)}`,
  {
    method: "PUT",
    headers: { "if-match": `"${webReadAfterCreate.contentHash}"` },
    body: {
      structured: webStructured,
      expectedContentHash: webReadAfterCreate.contentHash,
      title: webReadAfterCreate.title,
      targetRole: webReadAfterCreate.targetRole,
      jdId: webReadAfterCreate.jdId,
      status: webReadAfterCreate.status,
    },
  },
);
assert.notEqual(webSaved.contentHash, webReadAfterCreate.contentHash);

const appReadAfterWebSave = await client.resumes.getResume(appCreated.resumeId);
assert.equal(appReadAfterWebSave.contentHash, webSaved.contentHash);
assert.deepEqual(appReadAfterWebSave.structured, webSaved.structured);

let conflictStatus: number | undefined;
try {
  await webRequest<ResumeFull>(
    accessToken,
    `/v1/product/resumes/${encodeURIComponent(appCreated.resumeId)}`,
    {
      method: "PUT",
      headers: { "if-match": `"${webReadAfterCreate.contentHash}"` },
      body: {
        structured: webReadAfterCreate.structured,
        expectedContentHash: webReadAfterCreate.contentHash,
      },
    },
  );
} catch (error: unknown) {
  if (error instanceof HttpError) conflictStatus = error.status;
  else throw error;
}
assert.equal(conflictStatus, 409);

const appReadAfterConflict = await client.resumes.getResume(appCreated.resumeId);
assert.equal(appReadAfterConflict.contentHash, webSaved.contentHash);
assert.deepEqual(appReadAfterConflict.structured, webSaved.structured);

const appList = await client.resumes.listResumes();
assert.equal(appList.length, 1);
assert.equal(appList[0]?.id, appCreated.resumeId);
assert.ok(appList.every((resume) => !("variants" in resume)));
assert.ok(appList.every((resume) => !("activeVariantId" in resume)));

await client.logout();

process.stdout.write(
  `${JSON.stringify({
    passed: true,
    imported: {
      userId: registration.data.userId,
      jdCount: 1,
      experienceCount: created.length,
      resumeCount: appList.length,
    },
    appToWeb: {
      resumeId: appCreated.resumeId,
      contentHash: appReadAfterCreate.contentHash,
      structuredMatches: true,
    },
    webToApp: {
      contentHash: webSaved.contentHash,
      structuredMatches: true,
    },
    staleWrite: {
      status: conflictStatus,
      currentContentUnchanged: true,
    },
    cloudVariantsPresent: false,
  }, null, 2)}\n`,
);

async function approveSave(
  apiClient: CooltoApiClient,
  payload: ResumeSaveApprovalPayload,
) {
  const manager = createActionApprovalManager(
    apiClient,
    new ExperienceImportProposalStore(),
    apiClient.resumes,
  );
  let result:
    | { type: "approval.completed"; details?: Record<string, unknown> }
    | { type: "approval.failed"; message: string }
    | undefined;
  manager.subscribe((event) => {
    if (event.type === "approval.completed" || event.type === "approval.failed") {
      result = event;
    }
  });
  const request = await manager.request(
    createResumeSaveApprovalDraft(payload),
    payload,
  );
  await manager.resolve(request.id, { type: "accept" });
  if (!result || result.type !== "approval.completed") {
    throw new Error(
      result?.type === "approval.failed"
        ? `App approval failed: ${result.message}`
        : "App approval produced no terminal result",
    );
  }
  const resumeId = result.details?.resumeId;
  const contentHash = result.details?.contentHash;
  assert.equal(typeof resumeId, "string");
  assert.equal(typeof contentHash, "string");
  return { resumeId, contentHash };
}

async function readQualifiedCompileResult(
  path: string,
): Promise<ResumeCompileResult> {
  const report = JSON.parse(await readFile(path, "utf8")) as {
    compileResults: ResumeCompileResult[];
  };
  const result = report.compileResults.find(
    (item) => item.fixtureId === "zh-qualified",
  );
  if (!result?.qualified) {
    throw new Error("A qualified Chromium layout result is required");
  }
  return result;
}

interface WebRequestOptions {
  method?: "GET" | "POST" | "PUT";
  headers?: Record<string, string>;
  body?: unknown;
}

async function webRequest<T>(
  token: string,
  path: string,
  options: WebRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("cookie", `access_token=${token}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const result = await fetchJson<T>(path, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  return result.data;
}

async function fetchJson<T>(path: string, init: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = (await response.json()) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || payload.success !== true || payload.data === undefined) {
    throw new HttpError(
      response.status,
      payload.error?.code,
      payload.error?.message ?? `HTTP ${response.status}`,
    );
  }
  return { data: payload.data, response };
}

function extractAccessToken(headers: Headers): string | undefined {
  const values =
    (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  for (const value of values) {
    const match = /(?:^|,\s*)access_token=([^;,\s]+)/u.exec(value);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
