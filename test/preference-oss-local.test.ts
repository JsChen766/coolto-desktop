import assert from "node:assert/strict";
import test from "node:test";

import {
  createPreferenceApprovalDraft,
} from "../src/preference/approval-draft.js";
import { createPreparePreferenceChangeTool } from "../src/tools/prepare-preference-change.js";
import type { PreferenceWriteProposalV1 } from "../src/preference/types.js";
import { assertSafePreferenceValue } from "../src/preference/key-registry.js";
import { resolvePreferences } from "../src/preference/resolution.js";
import { normalizePreference } from "../src/preference/normalizer.js";

function proposal(partial: Partial<PreferenceWriteProposalV1> = {}): PreferenceWriteProposalV1 {
  const next = {
    version: 1 as const,
    id: "pref-1",
    ownerId: "user-1",
    entityVersion: 1,
    key: "resume.tone" as const,
    value: "restrained",
    scope: { kind: "global" as const },
    priority: 50,
    conflictGroup: "resume.tone",
    source: "explicit_user" as const,
    sourceSuggestionHash: null,
    status: "active" as const,
    ruleVersion: "resume-tone-v1",
    confirmedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    contentHash: "a".repeat(64),
  };
  return {
    id: "preference-proposal-1",
    action: "create",
    ownerId: "user-1",
    preferenceId: "pref-1",
    current: null,
    next,
    expectedEntityVersion: null,
    localVersion: 1,
    preparedAt: "2026-01-01T00:00:00.000Z",
    explanation: "创建长期偏好",
    ...partial,
  };
}

test("Preference approval draft is local-only and previews before write", () => {
  const draft = createPreferenceApprovalDraft(proposal());
  assert.match(draft.description, /写入本机长期偏好/u);
  assert.match(draft.description, /开源版不连接 Coolto 云/u);
  assert.equal(draft.title, "保存为长期偏好");
  assert.equal(draft.preview?.preference?.proposedValue, "restrained");
  assert.doesNotMatch(draft.description, /Coolto 同步协议/u);
});

test("prepare_preference_change tool requires explicit remember-and-approve wording", () => {
  const tool = createPreparePreferenceChangeTool(
    {} as never,
    {} as never,
  );
  assert.match(tool.description, /以后都这样/u);
  assert.match(tool.description, /确认前不写入/u);
  assert.match(tool.description, /禁止密码/u);
  assert.match(tool.description, /本轮临时指令不得调用/u);
});

test("sensitive identity and auth shapes are rejected from preference values", () => {
  for (const value of ["password", "验证码", "user@example.com", "13800138000", "身份证", "sk-abcdefghijklmnopqrstuvwxyz"]) {
    assert.throws(() => assertSafePreferenceValue(value), /敏感|禁存/u);
  }
});

test("deleted preference is ignored and current-turn override wins", () => {
  const base = {
    version: 1 as const,
    ownerId: "user-1",
    entityVersion: 1,
    key: "resume.tone" as const,
    value: "direct",
    scope: { kind: "global" as const },
    priority: 50,
    conflictGroup: "resume.tone",
    source: "explicit_user" as const,
    sourceSuggestionHash: null,
    status: "active" as const,
    ruleVersion: "resume-tone-v1",
    confirmedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null as string | null,
    contentHash: undefined as unknown as string,
  };
  const active = normalizePreference({ ...base, id: "active", value: "direct" });
  const deleted = normalizePreference({
    ...base, id: "gone", value: "standard",
    deletedAt: "2026-01-10T00:00:00.000Z", status: "disabled",
  });
  const context = {
    ownerId: "user-1", sessionId: "s1", turnId: "t1", actionId: "a1",
    taskScope: "resume" as const, targetFingerprint: null, domain: null,
  };
  const withoutDeleted = resolvePreferences({
    preferences: [active, deleted], context, now: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(withoutDeleted.applied[0]?.preferenceId, "active");
  assert.ok(withoutDeleted.ignored.some((item) => item.preferenceId === "gone" && item.reason === "deleted"));
  const overridden = resolvePreferences({
    preferences: [active], context,
    currentOverride: { key: "resume.tone", value: "restrained" },
    now: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(overridden.applied[0]?.value, "restrained");
  assert.equal(overridden.applied[0]?.reason, "current_turn_override");
  assert.ok(overridden.overridden.some((item) => item.preferenceId === "active"));
});
