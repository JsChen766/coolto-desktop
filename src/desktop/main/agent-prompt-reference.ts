import type { AgentPromptInput } from "../shared/types.js";

export function promptWithResumeReference(
  text: string,
  reference: NonNullable<AgentPromptInput["resumeReference"]>,
): string {
  return [
    text.trim(),
    "",
    "<resume_reference>",
    `artifact_id: ${reference.artifactId}`,
    `target_type: ${reference.targetType}`,
    `target_id: ${reference.targetId}`,
    `label: ${reference.label}`,
    "Use the restored ResumeWorkspace and stable target ID. Keep all unrelated content unchanged.",
    "</resume_reference>",
  ].join("\n");
}
