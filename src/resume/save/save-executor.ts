import type {
  ActionExecutionContext,
  ActionExecutor,
} from "../../approvals/executor-registry.js";
import type {
  ResumePublicationGateway,
  ResumePublicationStageResult,
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
  let staged: ResumePublicationStageResult | undefined;
  try {
    staged = payload.mode === "new_resume"
      ? await gateway.stageNew(payload, context.request.payloadHash, context.signal)
      : await gateway.stageVariant(payload, context.request.payloadHash, context.signal);
    const verification = await gateway.verify(
      staged.resumeId,
      staged.variantId,
      payload.observation,
      context.signal,
    );
    if (!verification.canAccept || verification.status !== "passed") {
      throw new Error(
        `服务端简历复验未通过：${verification.violations.map((item) => item.code).join(", ") || verification.status}`,
      );
    }
    const accepted = await acceptWithRecovery(
      gateway,
      staged,
      context.signal,
    );
    return {
      summary: `简历已保存并发布：${payload.title}`,
      details: {
        proposalId: payload.proposalId,
        resumeId: accepted.resumeId,
        variantId: accepted.variantId,
        activeVariantId: accepted.activeVariantId,
        publicationStatus: accepted.publicationStatus,
      },
    };
  } catch (error: unknown) {
    if (staged && !(await isActive(gateway, staged, context.signal))) {
      await bestEffortReject(gateway, staged, context.signal);
    }
    throw error;
  }
}

async function acceptWithRecovery(
  gateway: ResumePublicationGateway,
  staged: ResumePublicationStageResult,
  signal?: AbortSignal,
) {
  try {
    return await gateway.accept(staged.resumeId, staged.variantId, signal);
  } catch (error: unknown) {
    if (await isActive(gateway, staged, signal)) {
      return {
        resumeId: staged.resumeId,
        variantId: staged.variantId,
        activeVariantId: staged.variantId,
        gateStatus: "passed" as const,
        publicationStatus: "published" as const,
      };
    }
    throw error;
  }
}

async function isActive(
  gateway: ResumePublicationGateway,
  staged: ResumePublicationStageResult,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const resume = await gateway.getResume(staged.resumeId, signal);
    return resume.activeVariantId === staged.variantId;
  } catch {
    return false;
  }
}

async function bestEffortReject(
  gateway: ResumePublicationGateway,
  staged: ResumePublicationStageResult,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await gateway.reject(staged.resumeId, staged.variantId, signal);
  } catch {
    // The original save error is more actionable; active variants reject discard.
  }
}

function readPayload(payload: unknown): ResumeSaveApprovalPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { proposalId?: unknown }).proposalId !== "string" ||
    !["new_resume", "new_variant"].includes(
      String((payload as { mode?: unknown }).mode),
    )
  ) {
    throw new Error("简历保存审批 Payload 无效");
  }
  return structuredClone(payload as ResumeSaveApprovalPayload);
}
