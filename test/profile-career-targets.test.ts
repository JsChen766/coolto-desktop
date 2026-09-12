import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash as nodeCanonicalHash } from "../src/agent-task/canonical-hash.js";
import { canonicalHash as browserCanonicalHash } from "../src/profile/browser-canonical-hash.js";
import type { JsonValue } from "../src/agent-task/json-types.js";

import {
  careerTargetFingerprint,
  createCareerTarget,
  legacyToCareerTargets,
  normalizeCareerProfile,
  normalizeCareerProfileChangeSet,
  normalizeCareerTarget,
  normalizeCareerTargets,
  setPrimaryCareerTarget,
  targetsToLegacy,
} from "../src/profile/career-targets.js";
import {
  assertSupportedProfileWrite,
  normalizeProfileLanguage,
  normalizeProfileResumeStyle,
  profileDefaultLabel,
  profileDefaultState,
} from "../src/profile/profile-defaults.js";

const opaqueId = (suffix: number | string): string =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const target = {
  id: opaqueId(1), role: " 产品经理 ", industries: ["互联网", " SaaS "],
  locations: ["香港"], isPrimary: false,
};

test("browser canonical hash matches Node for UTF-8 and nested canonical JSON", () => {
  const fixtures: JsonValue[] = [
    null, true, 0, -12.5, "中文😀", [], {},
    { z: ["空", 3, false], a: { nested: { key: "值" } } },
  ];
  for (const fixture of fixtures) {
    assert.equal(browserCanonicalHash(fixture), nodeCanonicalHash(fixture));
  }
});

test("career targets normalize Unicode text, sort lists, and derive stable identity", () => {
  const normalized = normalizeCareerTargets([target])[0]!;
  assert.deepEqual(normalized.industries, ["SaaS", "互联网"]);
  assert.equal(normalized.role, "产品经理");
  assert.equal(normalized.id, opaqueId(1));
  assert.match(careerTargetFingerprint(normalized), /^[0-9a-f]{64}$/u);
  assert.equal(
    careerTargetFingerprint(normalized),
    careerTargetFingerprint(normalizeCareerTargets([{ ...target, isPrimary: true }])[0]!),
  );
});

test("trusted target creation keeps IDs opaque across content edits", () => {
  const draft = {
    role: "产品经理", industries: ["互联网"], locations: ["香港"], isPrimary: false,
  };
  const before = createCareerTarget(draft, () => opaqueId(2));
  const sameContent = createCareerTarget(draft, () => opaqueId(3));
  assert.equal(before.idKind, "opaque");
  assert.notEqual(before.id, sameContent.id);
  assert.equal(careerTargetFingerprint(before), careerTargetFingerprint(sameContent));
  const after = normalizeCareerTarget({
    ...before, locations: ["深圳"], isPrimary: true,
  });
  assert.equal(after.id, before.id);
  assert.equal(after.idKind, "opaque");
  assert.notEqual(careerTargetFingerprint(after), careerTargetFingerprint(before));
  assert.throws(() => normalizeCareerTarget({
    ...before, id: `legacy:${careerTargetFingerprint(before)}`,
  }), /显式标记/u);
  assert.throws(() => normalizeCareerTarget({
    ...before, id: before.id.replace("-4000-", "-5000-"),
  }), /opaque target idFactory/u);
});

test("legacy arrays collapse to one deterministic compatibility target", () => {
  const targets = legacyToCareerTargets({
    targetRoles: ["工程师", "产品经理"], targetIndustries: ["互联网"], targetLocations: ["香港"],
  });
  assert.equal(targets.length, 1);
  assert.equal(targets[0]!.idKind, "legacy_compatibility");
  assert.deepEqual(targets[0] && (({ role, industries, locations }) => ({ role, industries, locations }))(targets[0]), {
    role: "产品经理", industries: ["互联网"], locations: ["香港"],
  });
  const repeated = legacyToCareerTargets({
    targetRoles: ["工程师", "产品经理"], targetIndustries: ["互联网"], targetLocations: ["香港"],
  });
  assert.deepEqual(repeated.map((target) => target.id), targets.map((target) => target.id));
  assert.deepEqual(targetsToLegacy(targets), {
    targetRoles: ["产品经理"], targetIndustries: ["互联网"], targetLocations: ["香港"],
  });
  const profile = normalizeCareerProfile({ targetRoles: ["工程师"], targetIndustries: [], targetLocations: [] });
  assert.equal(profile.careerTargets.length, 1);
  assert.equal(profile.preferredLanguage, "zh-CN");
  assert.equal(profile.resumeStyle, "standard");
});
test("empty legacy arrays stay empty and primary selection preserves target IDs", () => {
  const empty = normalizeCareerProfile({
    targetRoles: [], targetIndustries: [], targetLocations: [],
  });
  assert.deepEqual(empty.careerTargets, []);
  const targets = normalizeCareerTargets([
    { id: opaqueId(4), role: "工程师", industries: [], locations: [], isPrimary: true },
    { id: opaqueId(5), role: "产品经理", industries: [], locations: [], isPrimary: false },
  ]);
  const selected = setPrimaryCareerTarget(targets, opaqueId(5));
  assert.deepEqual(selected.map((value) => [value.id, value.isPrimary]), [
    [opaqueId(4), false], [opaqueId(5), true],
  ]);
  assert.deepEqual(targets.map((value) => value.id), [opaqueId(4), opaqueId(5)]);
  assert.throws(() => setPrimaryCareerTarget(targets, "missing"), /不存在/u);
});

test("canonical and legacy target representations must agree", () => {
  assert.throws(() => normalizeCareerProfile({
    careerTargets: [{ id: opaqueId(6), role: "工程师", industries: [], locations: [], isPrimary: false }],
    targetRoles: ["产品经理"], targetIndustries: [], targetLocations: [],
  }), /不一致/u);
});

test("target invariants reject duplicates, empty targets, excess entries, and primary conflicts", () => {
  assert.throws(() => normalizeCareerTargets([
    { ...target }, { ...target, id: opaqueId(7), isPrimary: true },
  ]), /重复目标/u);
  assert.throws(() => normalizeCareerTargets([
    { id: opaqueId(8), role: "a", industries: [], locations: [], isPrimary: true },
    { id: opaqueId(9), role: "b", industries: [], locations: [], isPrimary: true },
  ]), /一个主要目标/u);
  assert.throws(() => normalizeCareerTargets([{
    id: opaqueId(10), role: "", industries: [], locations: [],
  }]), /至少需要/u);
  assert.throws(() => normalizeCareerTargets(Array.from({ length: 21 }, (_, index) => ({
    id: opaqueId(index + 11), role: `role-${index}`, industries: [], locations: [],
  }))), /20/u);
  assert.throws(() => normalizeCareerTargets([{
    id: opaqueId(40), role: "x", industries: ["x", "x"], locations: [],
  }]), /重复值/u);
  assert.throws(() => normalizeCareerTargets([{
    id: opaqueId(41), role: "x", industries: ["😀".repeat(121)], locations: [],
  }]), /120/u);
});

test("profile defaults use safe defaults, preserve unknown legacy values, and reject unknown writes", () => {
  assert.equal(normalizeProfileLanguage(null), "zh-CN");
  assert.equal(normalizeProfileResumeStyle(undefined), "standard");
  assert.equal(normalizeProfileResumeStyle(" legacy-style "), "legacy-style");
  assert.equal(profileDefaultState("resumeStyle", "legacy-style"), "unrecognized");
  assert.equal(profileDefaultLabel("resumeStyle", "legacy-style"), "未识别");
  assert.equal(profileDefaultLabel("language", null), "未设置");
  assert.equal(assertSupportedProfileWrite("en-US", "language"), "en-US");
  assert.throws(() => assertSupportedProfileWrite("legacy-style", "resumeStyle"), /不支持/u);
});

test("profile proposal normalization accepts explicit fields only and validates supported defaults", () => {
  assert.deepEqual(normalizeCareerProfileChangeSet({
    currentTitle: "  工程师 ", preferredLanguage: "en-US", resumeStyle: "direct",
  }), { currentTitle: "工程师", preferredLanguage: "en-US", resumeStyle: "direct" });
  assert.deepEqual(normalizeCareerProfileChangeSet({ yearsOfExperience: 80 }), { yearsOfExperience: 80 });
  assert.throws(() => normalizeCareerProfileChangeSet({ yearsOfExperience: 80.5 }), /0 到 80 的整数/u);
  assert.throws(() => normalizeCareerProfileChangeSet({ yearsOfExperience: 81 }), /0 到 80 的整数/u);
  assert.throws(() => normalizeCareerProfileChangeSet({}), /不能为空/u);
  assert.throws(() => normalizeCareerProfileChangeSet({ preferredLanguage: null }), /受支持/u);
  assert.throws(() => normalizeCareerProfileChangeSet({ careerStage: "legacy-stage" }), /不支持/u);
});

for (const [index, input] of Array.from({ length: 32 }, (_, index) => [index, {
  id: opaqueId(index + 100), role: `R${index}`, industries: [`I${index % 4}`],
  locations: [`L${index % 3}`],
}] as const)) {
  test(`target normalization property ${index}`, () => {
    const first = normalizeCareerTargets([input])[0]!;
    const second = normalizeCareerTargets([{
      ...input, role: `  ${input.role!.normalize("NFKC")}  `,
      industries: [...input.industries].reverse(),
      locations: [...input.locations],
    }])[0]!;
    assert.equal(first.id, second.id);
    assert.equal(careerTargetFingerprint(first), careerTargetFingerprint(second));
  });
}
