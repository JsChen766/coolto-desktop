import type {
  DesktopApi,
  ResumeDraftDetail,
} from "../../../shared/types.js";

export function createOnboardingSampleResumeApi(
  draft: ResumeDraftDetail,
): DesktopApi["resumeDrafts"] {
  const requireDraft = (artifactId: string): void => {
    if (artifactId !== draft.artifactId) throw new Error("示例简历不存在");
  };
  const blocked = async (): Promise<never> => {
    throw new Error("一次性示例简历不可修改或保存");
  };
  return {
    list: async () => [{
      artifactId: draft.artifactId, title: draft.title, jdId: draft.jdId,
      jdTitle: draft.jdTitle, targetRole: draft.targetRole,
      conversationIds: [], updatedAt: draft.updatedAt,
      checkpointCount: draft.checkpoints.length, hasPendingChange: false,
      generationStrategy: "tailored", generationReady: true,
      workspaceStatus: draft.workspaceStatus,
      cloudState: "synced", cloudResumeId: null,
    }],
    get: async (artifactId) => {
      requireDraft(artifactId);
      return structuredClone(draft);
    },
    edit: blocked,
    setLineSpacing: blocked,
    restore: blocked,
    accept: async (artifactId) => {
      requireDraft(artifactId);
      return structuredClone(draft);
    },
    reject: async (artifactId) => {
      requireDraft(artifactId);
      return structuredClone(draft);
    },
    exportPdf: async () => ({ status: "cancelled" }),
    save: async ({ artifactId }) => {
      requireDraft(artifactId);
      return structuredClone(draft);
    },
  };
}
