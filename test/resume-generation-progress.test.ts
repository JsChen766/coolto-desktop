import assert from "node:assert/strict";
import test from "node:test";

import { projectToolProgress } from "../src/agent/tool-progress.js";
import { mapPiEvent } from "../src/agent/events.js";
import {
  completedToolProgressLabel,
  startedToolProgressLabel,
} from "../src/desktop/renderer/src/chat/resume-progress-label.js";

test("tool progress projects only bounded resume receipt facts", () => {
  const progress = projectToolProgress("apply_resume_content", {
    details: {
      revision: 8,
      readiness: { ready: false },
      nextAction: { mode: "batch_tail_rewrite", remainingTailCount: 12 },
      layout: { usageRatio: 0.934, pageCount: 1 },
      tailRepairFeedback: [
        { bulletId: "a", status: "applied" },
        { bulletId: "b", status: "rejected" },
      ],
      tailRepairDiagnostics: {
        requestedTargetCount: 2,
        requestedCandidateCount: 4,
        measuredCandidateCount: 3,
        appliedTargetCount: 1,
        validationRejectedCandidateCount: 1,
        repetitionRejectedCandidateCount: 1,
        layoutRejectedCandidateCount: 1,
      },
      resume: { privateText: "must not enter the renderer event" },
    },
  });

  assert.deepEqual(progress, {
    phase: "tail_repair",
    revision: 8,
    usageRatio: 0.934,
    pageCount: 1,
    remainingTailCount: 12,
    repairedTailCount: 1,
    measuredTailCount: 3,
    appliedTailCount: 1,
    rejectedTailCount: 2,
    validationRejectedTailCount: 1,
    requestedTargetCount: 2,
  });
  assert.doesNotMatch(JSON.stringify(progress), /privateText/u);
});

test("tail progress exposes semantic growth hints", () => {
  const progress = projectToolProgress("apply_resume_content", {
    details: {
      readiness: { ready: false },
      nextAction: {
        mode: "batch_tail_rewrite",
        remainingTailCount: 1,
        tailRewriteTargets: [{
          requiredEdit: "提交完整事实等价改写",
          bulletId: "bullet-1",
          currentText: "一".repeat(70),
          sourceQuotes: [],
        }],
      },
    },
  });

  assert.deepEqual(progress?.nextTailTargets, [{
    bulletId: "bullet-1",
    growthHint: "事实等价展开",
  }]);
});

test("tool progress labels describe factual generation milestones", () => {
  assert.equal(
    startedToolProgressLabel("search_experiences", {}),
    "正在检索经历库中的相关经历",
  );
  assert.equal(
    startedToolProgressLabel("apply_resume_content", { tailRewrites: [{}] }),
    "正在生成并实测自然的完整尾行改写",
  );
  assert.equal(
    startedToolProgressLabel("apply_resume_content", { lineExpansions: [{}] }),
    "正在按内容结构扩写 bullet 并重新排版",
  );
  assert.equal(
    startedToolProgressLabel("apply_resume_content", { bulletRemovals: [{}] }),
    "正在移除一条低价值 bullet 并重新排版",
  );
  assert.equal(
    completedToolProgressLabel({
      phase: "tail_repair",
      usageRatio: 0.934,
      remainingTailCount: 12,
      repairedTailCount: 1,
      measuredTailCount: 2,
    }),
    "已修复 1 条尾行，页面占用率 93.4%，剩余 12 条",
  );
});

test("overflow progress reports one bullet removal instead of source loss", () => {
  const progress = projectToolProgress("apply_resume_content", {
    details: {
      revision: 11,
      readiness: { ready: false },
      nextAction: { mode: "batch_tail_rewrite", remainingTailCount: 4 },
      layout: { usageRatio: 0.972, pageCount: 1 },
      overflowReductionDiagnostics: { removedBulletCount: 1 },
    },
  });

  assert.equal(progress?.phase, "trimming");
  assert.equal(progress?.removedBulletCount, 1);
  assert.equal(
    completedToolProgressLabel(progress),
    "已移除 1 条低价值 bullet 并重新排版，页面占用率 97.2%",
  );
});

test("depth rewrite progress is not mislabeled as page filling", () => {
  const progress = projectToolProgress("apply_resume_content", {
    details: {
      revision: 4,
      readiness: { ready: false },
      nextAction: { mode: "increase_usage" },
      layout: { usageRatio: 0.84, pageCount: 1 },
      lineRewriteDiagnostics: {
        phase: "bullet_depth",
        requestedTargetCount: 14,
        measuredRewriteCount: 14,
        appliedRewriteCount: 14,
        stackedProgressCount: 5,
        heightGrowthCount: 9,
        skippedRewriteCount: 0,
      },
    },
  });

  assert.equal(progress?.phase, "depth_repair");
  assert.equal(
    completedToolProgressLabel(progress),
    "已应用 14 条 bullet 深度扩写（5 条继续叠加），页面占用率 84.0%",
  );
});

test("filling progress reports applied stacked rewrite facts", () => {
  const progress = projectToolProgress("apply_resume_content", {
    details: {
      revision: 5,
      readiness: { ready: false },
      nextAction: { mode: "increase_usage" },
      layout: { usageRatio: 0.914, pageCount: 1 },
      lineRewriteDiagnostics: {
        requestedTargetCount: 8,
        measuredRewriteCount: 8,
        appliedRewriteCount: 5,
        stackedProgressCount: 3,
        heightGrowthCount: 2,
        skippedRewriteCount: 3,
      },
    },
  });

  assert.equal(progress?.requestedTargetCount, 8);
  assert.equal(progress?.measuredRewriteCount, 8);
  assert.equal(progress?.stackedProgressCount, 3);
  assert.equal(
    completedToolProgressLabel(progress),
    "已应用 5 条篇幅扩写（3 条继续叠加），页面占用率 91.4%",
  );
});

test("rewrite diagnostics keep the completed operation phase during transition", () => {
  const progress = projectToolProgress("apply_resume_content", {
    details: {
      revision: 6,
      readiness: { ready: false },
      nextAction: { mode: "batch_tail_rewrite", remainingTailCount: 17 },
      layout: { usageRatio: 0.9302, pageCount: 1 },
      lineRewriteDiagnostics: {
        requestedTargetCount: 8,
        measuredRewriteCount: 8,
        appliedRewriteCount: 2,
        stackedProgressCount: 0,
        heightGrowthCount: 2,
        skippedRewriteCount: 6,
      },
    },
  });

  assert.equal(progress?.phase, "filling");
  assert.equal(
    completedToolProgressLabel(progress),
    "已应用 2 条篇幅扩写，页面占用率 93.0%",
  );
});

test("tail progress does not report a zero-measurement batch", () => {
  assert.equal(
    completedToolProgressLabel({
      phase: "tail_repair",
      usageRatio: 0.932,
      remainingTailCount: 9,
      repairedTailCount: 0,
      measuredTailCount: 0,
    }),
    "页面占用率 93.2%，正在准备下一批完整尾行改写，剩余 9 条",
  );
});

test("tail progress reports formally applied intermediate improvements", () => {
  assert.equal(
    completedToolProgressLabel({
      phase: "tail_repair",
      usageRatio: 0.986,
      remainingTailCount: 14,
      repairedTailCount: 0,
      progressedTailCount: 9,
      measuredTailCount: 14,
    }),
    "已推进 9 条尾行修订，页面占用率 98.6%，剩余 14 条",
  );
});

test("tail progress counts remaining violations after the next action changes", () => {
  const progress = projectToolProgress("apply_resume_content", {
    details: {
      revision: 15,
      readiness: { ready: false },
      nextAction: { mode: "request_more_material" },
      layout: {
        usageRatio: 0.9941,
        pageCount: 1,
        violations: Array.from({ length: 13 }, (_, index) => ({
          code: "bullet_tail_too_short",
          bulletId: `tail-${index + 1}`,
        })),
      },
      tailRepairDiagnostics: {
        requestedTargetCount: 17,
        measuredTargetCount: 17,
        appliedTargetCount: 4,
        passedTargetCount: 4,
        progressedTargetCount: 0,
        rejectedTargetCount: 13,
      },
    },
  });

  assert.equal(progress?.remainingTailCount, 13);
  assert.equal(
    completedToolProgressLabel(progress),
    "已修复 4 条尾行，页面占用率 99.4%，剩余 13 条",
  );
});

test("exhausted tail growth is reported as a material request", () => {
  const progress = projectToolProgress("apply_resume_content", {
    details: {
      readiness: { ready: false },
      nextAction: { mode: "request_more_material" },
      layout: { usageRatio: 0.9259, pageCount: 1 },
      tailRepairDiagnostics: {
        requestedTargetCount: 2,
        measuredTargetCount: 0,
        appliedTargetCount: 0,
        passedTargetCount: 0,
        progressedTargetCount: 0,
        rejectedTargetCount: 2,
      },
    },
  });

  assert.equal(progress?.phase, "tail_repair");
  assert.equal(
    completedToolProgressLabel(progress),
    "页面占用率 92.6%，正在准备下一批完整尾行改写，剩余 0 条",
  );
});

test("agent tool completion forwards the bounded progress projection", () => {
  const event = mapPiEvent({
    type: "tool_execution_end",
    toolCallId: "call-1",
    toolName: "apply_resume_content",
    isError: false,
    result: {
      content: [],
      details: {
        revision: 4,
        readiness: { ready: false },
        nextAction: { mode: "increase_usage" },
        layout: { usageRatio: 0.88, pageCount: 1 },
      },
    },
  } as never);

  assert.equal(event?.type, "tool.completed");
  if (event?.type !== "tool.completed") return;
  assert.equal(event.progress?.phase, "filling");
  assert.equal(event.progress?.usageRatio, 0.88);
});
