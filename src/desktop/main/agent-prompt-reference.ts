import type { AgentPromptInput } from "../shared/types.js";

export function promptWithResumeReference(
  text: string,
  reference: NonNullable<AgentPromptInput["resumeReference"]>,
): string {
  if (reference.source === "cloud") {
    return cloudResumePrompt(text, reference);
  }
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

function cloudResumePrompt(
  text: string,
  reference: NonNullable<AgentPromptInput["resumeReference"]>,
): string {
  const createCopy = reference.operationMode === "create_local_copy";
  return [
    text.trim(),
    "",
    "<resume_reference>",
    "source: cloud",
    `resume_id: ${reference.resumeId ?? reference.targetId}`,
    `content_hash: ${reference.contentHash ?? "unknown"}`,
    `label: ${reference.label}`,
    `operation_mode: ${createCopy ? "create_local_copy" : "read_only"}`,
    "Call get_resume with the exact resume_id before answering about its content.",
    createCopy
      ? "The user explicitly confirmed creating a local working copy. Never overwrite the cloud Resume. Rebuild a grounded local candidate from its exact JD and source experience IDs; if either is unavailable, ask only for the missing choice."
      : "This cloud Resume is read-only. Analyze or explain it, but do not create a candidate, prepare a save, or modify any asset. Tell the user to choose 创建本地工作副本 before editing.",
    "</resume_reference>",
  ].join("\n");
}
