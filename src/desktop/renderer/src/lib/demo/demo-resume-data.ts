import type { ResumeDraftDetail, ResumeLibraryEntry } from "@desktop/types";
import { getResumeFixture } from "../../../../../resume/fixtures";

export function createDemoLibraryEntries(): ResumeLibraryEntry[] {
  const now = new Date().toISOString();
  return [
    {
      entryId: "cloud:resume-001",
      displayTitle: "高级前端工程师简历",
      cloud: {
        resumeId: "resume-001",
        title: "高级前端工程师简历",
        targetRole: "高级前端工程师",
        jdId: "jd-001",
        status: "active",
        contentHash: "hash-aaa",
        updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
      },
      local: {
        artifactId: "741d9167-d87d-4a28-8b78-525d8a0a1017",
        title: "高级前端工程师简历",
        updatedAt: now,
        checkpointCount: 3,
        hasPendingChange: false,
      },
      syncStatus: "local_changes",
      availableOperations: ["open", "rename", "archive", "continue_editing", "export_pdf", "delete_local_draft", "restore_checkpoint"],
    },
    {
      entryId: "cloud:resume-002",
      displayTitle: "AI 产品经理简历",
      cloud: {
        resumeId: "resume-002",
        title: "AI 产品经理简历",
        targetRole: "AI 产品经理",
        jdId: null,
        status: "active",
        contentHash: "hash-bbb",
        updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
      local: null,
      syncStatus: "cloud_only",
      availableOperations: ["open", "rename", "archive", "continue_editing", "export_pdf"],
    },
    {
      entryId: "local:draft-002",
      displayTitle: "英文自我介绍（草稿）",
      cloud: null,
      local: {
        artifactId: "draft-002",
        title: "英文自我介绍（草稿）",
        updatedAt: new Date(Date.now() - 172_800_000).toISOString(),
        checkpointCount: 1,
        hasPendingChange: false,
      },
      syncStatus: "local_only",
      availableOperations: ["open", "delete_local_draft", "restore_checkpoint"],
    },
  ];
}

export function createDemoCheckpoints() {
  return [
    {
      id: "cp-1",
      label: "完成生成",
      reason: "generated" as const,
      createdAt: new Date(Date.now() - 7_200_000).toISOString(),
      workspace: {} as never,
    },
    {
      id: "cp-2",
      label: "接受 AI 修改",
      reason: "ai_change_accepted" as const,
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      workspace: {} as never,
    },
    {
      id: "cp-3",
      label: "手动修改",
      reason: "manual_edit" as const,
      createdAt: new Date(Date.now() - 1_800_000).toISOString(),
      workspace: {} as never,
    },
  ];
}

export function createDemoDraft(now: Date): ResumeDraftDetail {
  const structure = getResumeFixture("zh-qualified");
  const bullets = structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets),
  );
  const updatedAt = new Date(now.getTime() - 3 * 60_000).toISOString();
  return {
    artifactId: "741d9167-d87d-4a28-8b78-525d8a0a1017",
    title: "AI 产品经理简历",
    conversationIds: [],
    updatedAt,
    checkpointCount: 1,
    hasPendingChange: false,
    cloudState: "local_only",
    revision: 12,
    structure,
    compileResult: {
      templateId: "resume-standard",
      profileVersion: structure.layout_profile_version,
      profileHash: structure.layout_profile_hash,
      qualified: true,
      fontsReady: true,
      loadedFontFamilies: ["SimSun", "Times New Roman"],
      observedAt: updatedAt,
      viewport: { widthPx: 1280, heightPx: 820, devicePixelRatio: 1 },
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 923,
      availableHeightPx: 1000,
      bodyLineHeightPx: 15.34,
      bodyFontSizePx: 13,
      usageRatio: 0.923,
      effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 0.98 },
      bullets: bullets.map((bullet, index) => ({
        bulletId: bullet.id,
        lineCount: 2,
        lastLineWidthPx: 470 + (index % 4) * 12,
        availableLineWidthPx: 600,
        lastLineRatio: (470 + (index % 4) * 12) / 600,
        passed: true,
      })),
      violations: [],
    },
    workspaceStatus: "ready_for_approval",
    quality: {
      pageUsageRatio: 0.923,
      minimumBulletTailRatio: 470 / 600,
      minimumBulletTailTargetRatio: 2 / 3,
      factIntegrity: "passed",
      jdCoverage: { covered: 7, total: 8, ratio: 0.875 },
    },
    generationReadiness: { ready: true, blockers: [], warnings: [] },
    checkpoints: [
      {
        id: "4514605d-b3f6-4cad-ab22-c99782aee0ad",
        label: "完成生成",
        reason: "generated",
        createdAt: updatedAt,
        revision: 12,
      },
    ],
    pendingChange: null,
  };
}

export function draftSummary(draft: ResumeDraftDetail) {
  const {
    revision: _revision,
    structure: _structure,
    compileResult: _compileResult,
    workspaceStatus: _workspaceStatus,
    quality: _quality,
    generationReadiness: _generationReadiness,
    checkpoints: _checkpoints,
    pendingChange: _pendingChange,
    ...summary
  } = draft;
  return structuredClone(summary);
}
