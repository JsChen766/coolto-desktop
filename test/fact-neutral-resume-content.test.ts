import assert from "node:assert/strict";
import test from "node:test";

import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import { resumeAgentNextAction } from
  "../src/resume/workspace/agent-next-action.js";
import { evidenceForModel } from
  "../src/resume/workspace/agent-workspace-evidence.js";
import { factNeutralRewriteOptionPool, factNeutralRewriteOptions } from
  "../src/resume/workspace/fact-neutral-rewrite-options.js";
import type { TailLengthBudget } from
  "../src/resume/workspace/tail-length-budget.js";
import { expandFactNeutralTailCandidates } from
  "../src/resume/workspace/semantic-tail-neutral-candidates.js";
import {
  factEquivalentTailOptions,
  validateFactEquivalentTailEdit,
} from "../src/resume/workspace/fact-equivalent-tail.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";
import {
  completeFixtureWorkUnits,
  withFixtureWorkUnits,
} from "./support/resume-work-unit-fixture.js";

function resultText(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}

async function shortTailHarness() {
  const store = new ResumeWorkspaceStore();
  const compiler = new NeutralInsertionCompiler();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), compiler, store,
  );
  const created = resultText(await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "secondary" }],
  }));
  const apply = createApplyResumeContentTool(compiler, store);
  created.revision = completeFixtureWorkUnits(store).revision;
  const written = resultText(await apply.execute("draft", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [withFixtureWorkUnits(store.latest()!, {
        text: "使用 Python 清洗运营数据产品短尾",
        origin: "grounded",
        evidenceIds: ["work-1:0:19"],
        requirementIds: ["req-1"],
      }), withFixtureWorkUnits(store.latest()!, {
        text: "为 3 个团队建立周度报表",
        origin: "grounded",
        evidenceIds: ["work-1:19:33"],
        requirementIds: ["req-1"],
      })],
    }],
  }));
  const workspace = store.latest()!;
  const normalized = {
    ...workspace,
    reuseBase: {
      kind: "local" as const,
      resumeId: "existing-resume",
      sourceJdId: "jd-old",
      contentHash: "hash-old",
      retainedBulletCount: 2,
      droppedBulletCount: 0,
    },
  };
  store.restore(normalized);
  const draft = {
    ...written,
    revision: normalized.revision,
    nextAction: resumeAgentNextAction(normalized),
  };
  return { store, apply, draft };
}

test("authorized neutral rewrite can enrich only the current resume", async () => {
  const value = await shortTailHarness();
  const workspace = value.store.latest()!;
  value.store.replace({
    ...workspace,
    factNeutralAuthorization: {
      sourceRequestKind: "tail_repair_stalled",
      confirmedAt: new Date().toISOString(),
      confirmedMessageTimestamp: 200,
    },
  }, workspace.revision);
  const neutralAction = resumeAgentNextAction(value.store.latest()!);
  assert.equal(neutralAction.mode, "batch_tail_rewrite");
  if (neutralAction.mode !== "batch_tail_rewrite") return;
  assert.ok(neutralAction.tailRewriteTargets.every((target) =>
    target.suggestedNeutralCandidates?.length === 2 &&
    target.suggestedNeutralCandidates.every((candidate) =>
      keepsCharactersInOrder(target.currentText, candidate) &&
      !/相关背景|完整语境|信息关系/u.test(candidate)
    )
  ));
  const targetId = neutralAction.bulletIds[0]!;
  const target = neutralAction.tailRewriteTargets[0]!;
  const revisedText =
    `${target.currentText}，围绕既有事项分别展开并保持表达清晰`;
  const repaired = resultText(await value.apply.execute("neutral-tail", {
    candidateId: value.draft.candidateId,
    expectedRevision: value.draft.revision,
    tailRewrites: [{
      bulletId: targetId,
      candidates: [{
        strategy: "expand",
        revisedText,
        contentMode: "fact_neutral",
      }],
    }],
  }));
  assert.doesNotMatch(repaired.writeRejectedReason ?? "", /已禁用 fact_neutral/u);
  assert.equal(repaired.writeRejectedReason, undefined, JSON.stringify(repaired));
  assert.equal(
    value.store.latest()?.factNeutralFragments?.length ?? 0,
    1,
    JSON.stringify(repaired),
  );
  assert.equal(value.store.latest()?.awaitingUserConfirmation, null);
  assert.equal(value.store.latest()?.supplementalEvidence?.length ?? 0, 0);
});

test("neutral mode is rejected before authorization and ignores factual input", async () => {
  const value = await shortTailHarness();
  const noAuthorization = resultText(await value.apply.execute("early-neutral", {
    candidateId: value.draft.candidateId,
    expectedRevision: value.draft.revision,
    tailRewrites: [{
      bulletId: value.draft.nextAction.bulletIds[0],
      candidates: [{
        strategy: "expand",
        revisedText: "围绕既有事项分别展开并保持表达清晰",
        contentMode: "fact_neutral",
      }],
    }],
  }));
  assert.match(noAuthorization.writeRejectedReason, /尚未明确结束补充/u);

  const workspace = value.store.latest()!;
  value.store.replace({
    ...workspace,
    factNeutralAuthorization: {
      sourceRequestKind: "tail_repair_stalled",
      confirmedAt: new Date().toISOString(),
      confirmedMessageTimestamp: 200,
    },
  }, workspace.revision);
  const factualTargetId = value.draft.nextAction.bulletIds[0];
  const factualCurrentText = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets)
  ).find((bullet) => bullet.id === factualTargetId)!.text;
  resultText(await value.apply.execute("factual-neutral", {
    candidateId: value.draft.candidateId,
    expectedRevision: value.draft.revision,
    tailRewrites: [{
      bulletId: factualTargetId,
      candidates: [{
        strategy: "expand",
        revisedText: `${factualCurrentText}，实现效率提升并围绕既有事项展开`,
        contentMode: "fact_neutral",
      }],
    }],
  }));
  assert.doesNotMatch(
    value.store.latest()!.structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets.map((bullet) => bullet.text))
    ).join("\n"),
    /实现效率提升/u,
  );
});

class NeutralInsertionCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    const repairedIds = new Set(structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets.flatMap((bullet) =>
        bullet.text.endsWith("短尾") &&
          bullet.text !== "使用 Python 清洗运营数据产品短尾"
          ? [bullet.id] : []
      ))
    ));
    if (!repairedIds.size) return result;
    result.bullets = result.bullets.map((bullet) => repairedIds.has(bullet.bulletId)
      ? {
          ...bullet,
          lastLineWidthPx: 480,
          lastLineRatio: 0.8,
          passed: true,
        }
      : bullet);
    result.violations = result.violations.filter((violation) =>
      !violation.bulletId || !repairedIds.has(violation.bulletId)
    );
    result.qualified = result.violations.length === 0;
    return result;
  }
}

test("Chinese neutral closure inserts transitions between factual components", () => {
  const base = "研究 50+ 家企业，分析生成式 AI 影响，提出三支柱战略";
  const candidates = factNeutralRewriteOptions({
    bulletId: "long-neutral",
    currentText: base,
    language: "zh-CN",
    budget: {
      minimumGrowthCjk: 18,
      idealGrowthCjk: 24,
      maximumGrowthCjk: 32,
    } as TailLengthBudget,
  });
  assert.ok(candidates.every((candidate) => keepsCharactersInOrder(base, candidate)));
  assert.ok(candidates.every((candidate) =>
    candidate.startsWith("研究 50+ 家企业，")
  ));
  assert.ok(candidates.every((candidate) => candidate.endsWith("提出三支柱战略")));
  assert.ok(candidates.every((candidate) => !candidate.startsWith(`${base}，`)));
  assert.doesNotMatch(candidates.join("\n"), /相关背景|完整语境|信息关系/u);
  assert.doesNotMatch(candidates.join("\n"), /\s{2,}/u);
});

test("English neutral closure covers a large remaining tail deficit", () => {
  const base = "Conducted a 7-way benchmark across product scope, custody integration, and institutional accessibility";
  const candidates = factNeutralRewriteOptions({
    bulletId: "english-large-tail",
    currentText: base,
    language: "en-US",
    budget: {
      minimumGrowthCjk: 33,
      idealGrowthCjk: 37,
      maximumGrowthCjk: 41,
    } as TailLengthBudget,
  });
  const growth = candidates.map((candidate) =>
    visualUnits(candidate) - visualUnits(base)
  );
  assert.ok(growth.some((value) => value >= 33 && value <= 41),
    `expected a 33-41 CEU option, received ${growth.join(",")}`);
  assert.ok(candidates.every((candidate) => keepsCharactersInOrder(base, candidate)));
  assert.ok(candidates.every((candidate) => candidate.endsWith(base)));
  assert.ok(candidates.every((candidate) => !candidate.startsWith(`${base}, `)));
  assert.doesNotMatch(candidates.join("\n"), /^and |, and [A-Z]/mu);
  assert.doesNotMatch(candidates.join("\n"), /\s{2,}/u);
});

test("English neutral closure covers short and medium tail budgets", () => {
  const base = "Compiled quarterly reports from updated financial data";
  for (const budget of [
    { minimumGrowthCjk: 3, idealGrowthCjk: 5, maximumGrowthCjk: 9 },
    { minimumGrowthCjk: 8, idealGrowthCjk: 10, maximumGrowthCjk: 14 },
    { minimumGrowthCjk: 20, idealGrowthCjk: 22, maximumGrowthCjk: 26 },
  ] as TailLengthBudget[]) {
    const candidates = factNeutralRewriteOptions({
      bulletId: `english-budget-${budget.idealGrowthCjk}`,
      currentText: base,
      language: "en-US",
      budget,
    });
    assert.ok(candidates.some((candidate) => {
      const growth = visualUnits(candidate) - visualUnits(base);
      return growth >= budget.minimumGrowthCjk &&
        growth <= budget.maximumGrowthCjk;
    }), JSON.stringify({ budget, candidates }));
    assert.ok(candidates.every((candidate) => candidate.endsWith(base)));
  }
});

test("authorized tail processing preserves semantic placement and adds safe fallbacks", async () => {
  const value = await shortTailHarness();
  const workspace = value.store.latest()!;
  const base = "Conducted a 7-way benchmark across product scope, custody integration, and institutional accessibility";
  const budget = {
    minimumGrowthCjk: 33,
    idealGrowthCjk: 37,
    maximumGrowthCjk: 41,
  } as TailLengthBudget;
  const authorized = {
    ...workspace,
    structure: { ...workspace.structure, language: "en-US" as const },
    factNeutralAuthorization: {
      sourceRequestKind: "tail_repair_stalled" as const,
      confirmedAt: "2026-08-28T00:00:00.000Z",
      confirmedMessageTimestamp: 200,
    },
  };
  const expanded = expandFactNeutralTailCandidates(
    authorized,
    [{
      bulletId: "tail-1",
      candidates: [{
        strategy: "expand",
        revisedText: `Within this context, ${base}`,
        contentMode: "fact_neutral",
      }],
    }],
    new Map([["tail-1", { currentText: base, lengthBudget: budget }]]),
  );
  assert.ok(expanded[0]!.candidates.length > 2);
  assert.ok(expanded[0]!.candidates.some((candidate) =>
    candidate.revisedText === `Within this context, ${base}`
  ));
  assert.ok(expanded[0]!.candidates.every((candidate) =>
    candidate.contentMode === "fact_neutral" &&
    keepsCharactersInOrder(base, candidate.revisedText) &&
    candidate.revisedText.endsWith(base)
  ));
  assert.ok(expanded[0]!.candidates.some((candidate) => {
    const growth = visualUnits(candidate.revisedText) - visualUnits(base);
    return growth >= 33 && growth <= 41;
  }));
});

test("equal English budgets rotate neutral openings across bullets", () => {
  const base = "Compiled quarterly reports from updated financial data";
  const budget = {
    minimumGrowthCjk: 11,
    idealGrowthCjk: 13,
    maximumGrowthCjk: 17,
  } as TailLengthBudget;
  const first = factNeutralRewriteOptions({
    bulletId: "item-019ffbcd-e7cc-77b0-94d7-0befb57e74b9-bullet-4",
    currentText: base,
    language: "en-US",
    budget,
  });
  const second = factNeutralRewriteOptions({
    bulletId: "item-019ffbcd-e83b-7d19-93af-dfde356fbcdb-bullet-1",
    currentText: base,
    language: "en-US",
    budget,
  });
  assert.notEqual(first[0], second[0]);
  assert.ok([...first, ...second].every((candidate) =>
    candidate.endsWith(base)
  ));
});

test("final closure finds a semantic seam when punctuation is absent", () => {
  const base = "完成重点企业研究并形成投资判断";
  const candidates = factNeutralRewriteOptions({
    bulletId: "anchorless-neutral",
    currentText: base,
    language: "zh-CN",
    budget: { idealGrowthCjk: 32 } as TailLengthBudget,
  });
  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((candidate) =>
    keepsCharactersInOrder(base, candidate) &&
    [...candidate].length - [...base].length >= 20 &&
    candidate.endsWith("形成投资判断") &&
    !candidate.startsWith(`${base}，`)
  ));
});

test("English neutral closure offers an internal reflow for semicolon bullets", () => {
  const currentText = "Analyzed verified market evidence; modeled the documented demand range";
  const options = factNeutralRewriteOptionPool({
    bulletId: "semicolon-tail",
    currentText,
    language: "en-US",
  });
  assert.ok(options.some((candidate) =>
    /^Analyzed verified market evidence; .+, modeled/u.test(candidate)
  ));
  assert.ok(options.every((candidate) => {
    let index = 0;
    for (const character of candidate) {
      if (character === currentText[index]) index += 1;
    }
    return index === currentText.length;
  }));
});

test("fact-equivalent semicolon rewrites preserve every original token", () => {
  const currentText =
    "Analyzed verified SiC demand; modeled the documented 2028 range";
  const options = factEquivalentTailOptions(currentText);
  assert.equal(options.length, 3);
  assert.doesNotThrow(() => {
    for (const option of options) {
      validateFactEquivalentTailEdit(currentText, option);
    }
  });
  assert.throws(
    () => validateFactEquivalentTailEdit(
      currentText,
      "Analyzed verified SiC demand; improved the documented 2028 range",
    ),
    /非中性词|保留全部原词/u,
  );
});

test("authorized semicolon closure appends host-only fact-equivalent candidates", async () => {
  const value = await shortTailHarness();
  const workspace = value.store.latest()!;
  const currentText =
    "Analyzed verified SiC demand; modeled the documented 2028 range";
  const authorized = {
    ...workspace,
    structure: { ...workspace.structure, language: "en-US" as const },
    factNeutralAuthorization: {
      sourceRequestKind: "tail_repair_stalled" as const,
      confirmedAt: "2026-08-28T00:00:00.000Z",
      confirmedMessageTimestamp: 200,
    },
  };
  const expanded = expandFactNeutralTailCandidates(
    authorized,
    [{
      bulletId: "tail-semicolon",
      candidates: [{
        strategy: "expand",
        revisedText: `${currentText}, in context`,
        contentMode: "fact_neutral",
      }],
    }],
    new Map([["tail-semicolon", { currentText }]]),
  );
  const equivalent = expanded[0]!.candidates.filter((candidate) =>
    candidate.contentMode === "fact_equivalent"
  );
  assert.equal(equivalent.length, 3);
  assert.ok(equivalent.every((candidate) => {
    validateFactEquivalentTailEdit(currentText, candidate.revisedText);
    return true;
  }));
});

test("first generation consumes unused grounded evidence before neutral closure", async () => {
  const store = new ResumeWorkspaceStore();
  const compiler = new FixtureResumeCompiler();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder({
      workContent: [
        "使用 Python 清洗运营数据并形成周报。",
        "为 3 个团队建立周度报表。",
        "组织跨部门复盘并记录行动项。",
        "跟踪 20 个业务指标并发现异常。",
      ].join(""),
    }),
    compiler,
    store,
  );
  const created = resultText(await create.execute("create-grounded-first", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "secondary" }],
  }));
  const evidence = evidenceForModel(store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const apply = createApplyResumeContentTool(compiler, store);
  created.revision = completeFixtureWorkUnits(store).revision;
  await apply.execute("write-minimum", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: evidence.slice(0, 2).map((entry) => withFixtureWorkUnits(
        store.latest()!, {
        text: entry.text.replace(/。$/u, ""),
        origin: "grounded" as const,
        evidenceIds: [entry.evidenceId],
        requirementIds: ["req-1"],
      })),
    }],
  });
  const workspace = store.latest()!;
  const compileResult = {
    ...workspace.compileResult,
    qualified: true,
    pageCount: 1,
    overflowPx: 0,
    usageRatio: 0.93,
    usedHeightPx: workspace.compileResult.availableHeightPx * 0.93,
    violations: [],
    bullets: workspace.compileResult.bullets.map((bullet) => ({
      ...bullet,
      passed: true,
      lastLineRatio: 0.8,
    })),
  };
  store.restore({
    ...workspace,
    status: "ready_for_approval",
    compileResult,
    compileObservedRevision: workspace.revision,
    factNeutralAuthorization: {
      sourceRequestKind: "page_fill_stalled",
      confirmedAt: "2026-08-28T00:00:00.000Z",
      confirmedMessageTimestamp: 200,
    },
  });

  const action = resumeAgentNextAction(store.latest()!);
  assert.equal(action.mode, "increase_usage");
  if (action.mode !== "increase_usage") return;
  assert.equal(action.requiredInput, "bulletAdditions");
  assert.ok(action.groundedAdditionTargets.length >= 2);
  assert.equal(
    action.lineExpansionTargets.some((target) =>
      target.contentMode === "fact_neutral"
    ),
    false,
  );

  const firstBullet = compileResult.bullets[0]!;
  const atTargetCompile = {
    ...compileResult,
    qualified: false,
    usageRatio: 0.97,
    usedHeightPx: compileResult.availableHeightPx * 0.97,
    bullets: compileResult.bullets.map((bullet, index) => ({
      ...bullet,
      passed: index !== 0,
      lastLineRatio: index === 0 ? 0.5 : 0.8,
    })),
    violations: [{
      code: "bullet_tail_too_short" as const,
      message: "tail remains short",
      bulletId: firstBullet.bulletId,
    }],
  };
  store.restore({
    ...store.latest()!,
    status: "writing",
    compileResult: atTargetCompile,
    compileObservedRevision: workspace.revision,
  });
  const closure = resumeAgentNextAction(store.latest()!);
  assert.equal(closure.mode, "batch_tail_rewrite");
  if (closure.mode === "batch_tail_rewrite") {
    assert.ok(closure.tailRewriteTargets.every((target) =>
      target.contentMode === "fact_neutral" &&
      (target.suggestedNeutralCandidates?.length ?? 0) > 0
    ));
  }

  store.restore({
    ...store.latest()!,
    status: "ready_for_approval",
    compileResult,
    compileObservedRevision: workspace.revision,
    reuseBase: {
      kind: "local",
      resumeId: "base-draft",
      sourceJdId: "jd-old",
      contentHash: "hash-old",
      retainedBulletCount: 2,
      droppedBulletCount: 0,
    },
  });
  assert.equal(
    resumeAgentNextAction(store.latest()!).mode,
    "stop",
    "reuse keeps the existing 92% completion behavior",
  );
});

function keepsCharactersInOrder(base: string, candidate: string): boolean {
  let index = 0;
  for (const character of candidate.normalize("NFKC")) {
    if (character === [...base.normalize("NFKC")][index]) index += 1;
  }
  return index === [...base.normalize("NFKC")].length;
}

function visualUnits(value: string): number {
  return [...value].reduce((total, character) =>
    total + (/\p{Script=Han}/u.test(character)
      ? 1 : /\s/u.test(character) ? 0.25 : 0.5), 0);
}
