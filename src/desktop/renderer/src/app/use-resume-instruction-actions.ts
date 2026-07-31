import type { ResumeChatReference } from "@desktop/types";
import type { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";
import { translate } from "../i18n/locale";

interface ResumeInstructionOptions {
  workspace: ReturnType<typeof useResumeWorkspace>;
  send: (text: string, reference?: ResumeChatReference) => Promise<void>;
}

export function useResumeInstructionActions(
  options: ResumeInstructionOptions,
) {
  function activeReference(): ResumeChatReference | undefined {
    const draft = options.workspace.activeDraft.value;
    return draft
      ? {
          artifactId: draft.artifactId,
          targetType: "resume",
          targetId: draft.artifactId,
          label: draft.title,
          source: "local",
        }
      : undefined;
  }

  function sendInstruction(text: string): void {
    const reference = activeReference();
    if (reference) void options.send(text, reference);
  }

  function saveToCloud(): void {
    sendInstruction(translate("请将右侧当前本地简历保存到云端。"));
  }

  function exportPdf(): void {
    sendInstruction(translate("请将右侧当前简历导出为 PDF 到本地文件。"));
  }

  return { exportPdf, saveToCloud };
}
