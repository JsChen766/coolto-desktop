import type {
  ActionExecutionContext,
  ActionExecutor,
} from "../../approvals/executor-registry.js";
import type {
  ResumePublicationGateway,
  ResumeSaveApprovalPayload,
} from "./types.js";

export function createResumeSaveExecutor(
  gateway: ResumePublicationGateway,
): ActionExecutor {
  return {
    execute: (context) => executeSave(context, gateway),
  };
}

async function executeSave(
  context: ActionExecutionContext,
  gateway: ResumePublicationGateway,
) {
  const payload = readPayload(context.payload);
  const published = payload.mode === "new_resume"
    ? await gateway.publishNew(payload, context.request.payloadHash, context.signal)
    : await gateway.publishExisting(payload, context.request.payloadHash, context.signal);
  return {
    summary: `简历已保存并发布：${payload.title}`,
    details: {
      proposalId: payload.proposalId,
      resumeId: published.id,
      contentHash: published.contentHash,
      qualityStatus: published.qualityStatus,
      status: published.status,
      created: published.created,
    },
  };
}

function readPayload(payload: unknown): ResumeSaveApprovalPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { proposalId?: unknown }).proposalId !== "string" ||
    !["new_resume", "replace_resume"].includes(
      String((payload as { mode?: unknown }).mode),
    )
  ) {
    throw new Error("简历保存审批 Payload 无效");
  }
  return structuredClone(payload as ResumeSaveApprovalPayload);
}
