import type { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";

interface ResumeInstructionOptions {
  workspace: ReturnType<typeof useResumeWorkspace>;
}

export function useResumeInstructionActions(
  options: ResumeInstructionOptions,
) {
  function saveToCloud(): void {
    void options.workspace.saveActiveDraft();
  }

  function exportPdf(): void {
    void options.workspace.exportActiveDraft();
  }

  return { exportPdf, saveToCloud };
}
