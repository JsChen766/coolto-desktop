import assert from "node:assert/strict";
import test from "node:test";

import type { DesktopApi } from "../src/desktop/shared/types.js";
import { createOnboardingSampleRuntime } from
  "../src/desktop/renderer/src/onboarding/onboarding-sample-api.js";

test("sample runtime isolates fixed data and reveals it by real-flow stage", async () => {
  const runtime = createOnboardingSampleRuntime(
    baseApi(),
    "welcome",
  );
  const experiences = await runtime.api.experiences.search({ status: "active" });
  const initialAssets = await runtime.api.jobAssets.get();

  assert.equal(experiences.items.length, 3);
  assert.ok(experiences.items.every((item) => item.currentRevision?.source === "onboarding_sample"));
  assert.equal(initialAssets.jds.length, 1);
  assert.equal(initialAssets.resumes.length, 0);
  assert.equal((await runtime.api.applications.list()).items.length, 0);

  runtime.setStep("browser");
  const resumeAssets = await runtime.api.jobAssets.get();
  const drafts = await runtime.api.resumeDrafts.list();
  assert.equal(resumeAssets.resumes.length, 1);
  assert.equal(drafts.length, 1);
  const draft = await runtime.api.resumeDrafts.get(drafts[0]!.artifactId);
  assert.equal(draft.structure.contact?.email, "demo@coolto.example");
  assert.equal(draft.generationReady, true);
  const fixedOutput = JSON.stringify(draft.structure);
  assert.match(fixedOutput, /Harbour University（示例）/u);
  assert.doesNotMatch(fixedOutput, /香港科技大学|示例科技有限公司/u);

  runtime.setStep("tracker");
  const applications = await runtime.api.applications.list();
  assert.equal(applications.items.length, 1);
  assert.equal(applications.items[0]?.source, "browser");
  assert.equal(applications.items[0]?.syncStatus, "clean");
});

test("sample runtime blocks writes to formal business APIs", async () => {
  const runtime = createOnboardingSampleRuntime(
    baseApi(),
    "experience",
  );
  await assert.rejects(
    runtime.api.experiences.prepareCreate({
      category: "work", title: "should not write", content: "blocked",
    }),
    /不允许修改正式业务数据/u,
  );
  await assert.rejects(
    runtime.api.applications.create({
      companyName: "blocked", roleName: "blocked", deliveryMethod: "manual",
    }),
    /不允许修改正式业务数据/u,
  );
});

function baseApi(): DesktopApi {
  return {
    auth: {},
    agentTasks: {},
  } as unknown as DesktopApi;
}
