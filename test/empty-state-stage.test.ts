import assert from "node:assert/strict";
import test from "node:test";

import { isAvailableGeneralResume, resolveEmptyStateStage } from
  "../src/desktop/renderer/src/app/empty-state-stage.js";

test("first-use guidance builds a general resume before asking for a JD", () => {
  assert.equal(resolveEmptyStateStage({
    experienceCount: 0,
    generalResumeCount: 0,
    deliveryResumeFileCount: 0,
    jdCount: 0,
    applicationCount: 0,
  }), "experience_intake");
  assert.equal(resolveEmptyStateStage({
    experienceCount: 3,
    generalResumeCount: 0,
    deliveryResumeFileCount: 0,
    jdCount: 0,
    applicationCount: 0,
  }), "general_resume");
  assert.equal(resolveEmptyStateStage({
    experienceCount: 3,
    generalResumeCount: 1,
    deliveryResumeFileCount: 0,
    jdCount: 0,
    applicationCount: 0,
  }), "job_target");
});

test("existing application journeys are not reset by the new onboarding step", () => {
  assert.equal(resolveEmptyStateStage({
    experienceCount: 3,
    generalResumeCount: 0,
    deliveryResumeFileCount: 0,
    jdCount: 2,
    applicationCount: 1,
  }), "active_search");
});

test("a user source delivery file bypasses resume-writing onboarding", () => {
  assert.equal(resolveEmptyStateStage({
    experienceCount: 0,
    generalResumeCount: 0,
    deliveryResumeFileCount: 1,
    jdCount: 0,
    applicationCount: 0,
  }), "job_target");
  assert.equal(resolveEmptyStateStage({
    experienceCount: 0,
    generalResumeCount: 0,
    deliveryResumeFileCount: 1,
    jdCount: 1,
    applicationCount: 0,
  }), "application");
});

test("a ready local general draft completes onboarding before cloud save", () => {
  assert.equal(isAvailableGeneralResume({
    entryId: "local:general",
    displayTitle: "通用简历",
    cloud: null,
    local: {
      artifactId: "general",
      title: "通用简历",
      updatedAt: "2026-08-29T00:00:00.000Z",
      checkpointCount: 1,
      hasPendingChange: false,
      generationStrategy: "general",
      generationReady: true,
    },
    syncStatus: "local_only",
    availableOperations: ["open"],
  }), true);
});
