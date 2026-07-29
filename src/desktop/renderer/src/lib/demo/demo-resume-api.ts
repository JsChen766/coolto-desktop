import type { DesktopApi, ResumeDraftDetail } from "@desktop/types";

import {
  createDemoCheckpoints,
  createDemoLibraryEntries,
  draftSummary,
} from "./demo-resume-data";
import { getResumeFixture } from "../../../../../resume/fixtures";

export function createDemoResumeDraftApi(
  draft: ResumeDraftDetail,
): DesktopApi["resumeDrafts"] {
  const requireDraft = (artifactId: string): void => {
    if (artifactId !== draft.artifactId) throw new Error("本地简历草稿不存在");
  };
  return {
    list: async () => [draftSummary(draft)],
    get: async (artifactId) => {
      requireDraft(artifactId);
      return structuredClone(draft);
    },
    edit: async ({ artifactId, target, text, createCheckpoint }) => {
      requireDraft(artifactId);
      if (target.type === "bullet") {
        const bullet = draft.structure.sections
          .flatMap((section) => section.items)
          .flatMap((item) => item.bullets)
          .find((candidate) => candidate.id === target.bulletId);
        if (bullet) bullet.text = text.trim();
      } else {
        const item = draft.structure.sections
          .flatMap((section) => section.items)
          .find((candidate) => candidate.id === target.itemId);
        if (item) item.raw_text = text.trim();
      }
      draft.updatedAt = new Date().toISOString();
      draft.cloudState = "local_changes";
      draft.quality.factIntegrity = "needs_review";
      if (createCheckpoint !== false) {
        draft.checkpoints.push({
          id: crypto.randomUUID(),
          label: "手动修改",
          reason: "manual_edit",
          createdAt: draft.updatedAt,
          revision: draft.checkpoints.length + 1,
        });
      }
      return structuredClone(draft);
    },
    restore: async ({ artifactId, checkpointId }) => {
      requireDraft(artifactId);
      if (!draft.checkpoints.some((item) => item.id === checkpointId)) {
        throw new Error("本地简历版本不存在");
      }
      draft.updatedAt = new Date().toISOString();
      return structuredClone(draft);
    },
    accept: async () => structuredClone(draft),
    reject: async () => structuredClone(draft),
  };
}

export function createDemoLibraryApi(): DesktopApi["library"] {
  return {
    list: async () => createDemoLibraryEntries(),
    preview: async (resumeId) => ({
      resumeId,
      title: resumeId === "resume-002" ? "AI 产品经理简历" : "高级前端工程师简历",
      contentHash: `demo-${resumeId}`,
      updatedAt: new Date().toISOString(),
      structure: getResumeFixture("zh-qualified"),
    }),
    rename: async (input) => ({ id: input.resumeId, title: input.title }) as never,
    archive: async () => ({}) as never,
    deleteDraft: async () => undefined,
    getCheckpoints: async () => createDemoCheckpoints(),
    restoreCheckpoint: async () => ({}) as never,
  };
}
