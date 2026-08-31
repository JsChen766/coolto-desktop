import type { JdChatReference, ResumeChatReference } from
  "../../../shared/types.js";

export function plainResumeChatReference(
  value: ResumeChatReference,
): ResumeChatReference {
  return {
    artifactId: value.artifactId,
    targetType: value.targetType,
    targetId: value.targetId,
    label: value.label,
    ...(value.source ? { source: value.source } : {}),
    ...(value.resumeId ? { resumeId: value.resumeId } : {}),
    ...(value.contentHash ? { contentHash: value.contentHash } : {}),
    ...(value.operationMode ? { operationMode: value.operationMode } : {}),
  };
}

export function plainJdChatReference(value: JdChatReference): JdChatReference {
  return {
    jdId: value.jdId,
    title: value.title,
    action: value.action,
  };
}
