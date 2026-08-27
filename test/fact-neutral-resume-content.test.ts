import assert from "node:assert/strict";
import test from "node:test";

import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import { resumeAgentNextAction } from
  "../src/resume/workspace/agent-next-action.js";
import { factNeutralRewriteOptions } from
  "../src/resume/workspace/fact-neutral-rewrite-options.js";
import type { TailLengthBudget } from
  "../src/resume/workspace/tail-length-budget.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

function resultText(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}

async function shortTailHarness() {
  const store = new ResumeWorkspaceStore();
  const compiler = new FixtureResumeCompiler();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), compiler, store,
  );
  const created = resultText(await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "secondary" }],
  }));
  const apply = createApplyResumeContentTool(compiler, store);
  const draft = resultText(await apply.execute("draft", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [{
        text: "使用 Python 清洗运营数据产品短尾",
        origin: "grounded",
        evidenceIds: ["work-1:0:19"],
        requirementIds: ["req-1"],
      }, {
        text: "为 3 个团队建立周度报表",
        origin: "grounded",
        evidenceIds: ["work-1:19:33"],
        requirementIds: ["req-1"],
      }],
    }],
  }));
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
  const targetId = value.draft.nextAction.bulletIds[0];
  const currentText = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets)
  ).find((bullet) => bullet.id === targetId)!.text;
  const repaired = resultText(await value.apply.execute("neutral-tail", {
    candidateId: value.draft.candidateId,
    expectedRevision: value.draft.revision,
    tailRewrites: [{
      bulletId: targetId,
      candidates: [{
        strategy: "expand",
        revisedText: `${currentText}，围绕既有事项分别展开并保持表达清晰`,
        contentMode: "fact_neutral",
      }],
    }],
  }));
  assert.doesNotMatch(repaired.writeRejectedReason ?? "", /已禁用 fact_neutral/u);
  assert.equal(value.store.latest()?.factNeutralFragments?.length ?? 0, 1);
  assert.equal(value.store.latest()?.awaitingUserConfirmation, null);
  assert.equal(value.store.latest()?.supplementalEvidence?.length ?? 0, 0);
});

test("neutral mode is rejected before authorization and for factual claims", async () => {
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
  const factual = resultText(await value.apply.execute("factual-neutral", {
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
  assert.match(JSON.stringify(factual), /不得加入动作、结果或因果性事实主张/u);
});

test("long neutral candidates use natural clause transitions", () => {
  const base = "研究 50+ 家企业，分析生成式 AI 影响，提出三支柱战略";
  const candidates = factNeutralRewriteOptions({
    bulletId: "long-neutral",
    currentText: base,
    language: "zh-CN",
    budget: { idealGrowthCjk: 28 } as TailLengthBudget,
  });
  assert.ok(candidates.every((candidate) => keepsCharactersInOrder(base, candidate)));
  assert.doesNotMatch(candidates.join("\n"), /相关背景|完整语境|信息关系/u);
});

test("final closure can produce a long neutral option without punctuation anchors", () => {
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
    [...candidate].length - [...base].length >= 20
  ));
});

function keepsCharactersInOrder(base: string, candidate: string): boolean {
  let index = 0;
  for (const character of candidate.normalize("NFKC")) {
    if (character === [...base.normalize("NFKC")][index]) index += 1;
  }
  return index === [...base.normalize("NFKC")].length;
}
