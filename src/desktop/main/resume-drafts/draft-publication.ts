import type { ResumeWorkspace } from
  "../../../resume/workspace/types.js";

/** Keeps an empty planning/material workspace internal until it has user content. */
export function shouldPublishResumeWorkspace(
  workspace: ResumeWorkspace | undefined,
  alreadyPublished = false,
): boolean {
  if (!workspace) return false;
  if (alreadyPublished) return true;
  return workspace.structure.sections.some((section) =>
    section.items.some((item) => item.bullets.length > 0)
  );
}
