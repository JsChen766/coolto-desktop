import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every onboarding surface exposes a confirmed skip path", async () => {
  const [workspace, guide, controller, catalog] = await Promise.all([
    source("../src/desktop/renderer/src/onboarding/OnboardingWorkspace.vue"),
    source("../src/desktop/renderer/src/onboarding/OnboardingGuideBar.vue"),
    source("../src/desktop/renderer/src/onboarding/use-onboarding.ts"),
    source("../src/desktop/renderer/src/i18n/catalog-onboarding.ts"),
  ]);
  assert.match(workspace, /OnboardingSkipDialog/u);
  assert.match(workspace, /跳过引导/u);
  assert.match(workspace, /@skip=/u);
  assert.match(guide, /skipLabel/u);
  assert.match(controller, /base\.onboarding\.skip\(\)/u);
  assert.match(catalog, /跳过并进入首页.*Skip and go to home/u);
});

function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}
