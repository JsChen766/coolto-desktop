import type { JdWriter } from "../api/types.js";
import type {
  ActionExecutionContext,
  ActionExecutor,
} from "../approvals/executor-registry.js";
import type { JdSaveApprovalPayload } from "./types.js";
import { JdProposalStore } from "./proposal-store.js";
import { recordProductAction } from "../diagnostics/record-product-action.js";

export function createJdSaveExecutor(
  writer: JdWriter,
  proposalStore: JdProposalStore,
): ActionExecutor {
  return {
    execute: async (context) =>
      executeSave(context, writer, proposalStore),
    reject: (context) => {
      proposalStore.clear(readPayload(context.payload).proposalId);
      recordProductAction("jd_import", "cancelled");
    },
  };
}

async function executeSave(
  context: ActionExecutionContext,
  writer: JdWriter,
  proposalStore: JdProposalStore,
) {
  const payload = readPayload(context.payload);
  const requirements = payload.requirements.map((r) => {
    const mapped: {
      text: string;
      category: string;
      importance: typeof r.importance;
      keywords: string[];
      v2Importance?: typeof r.v2Importance & {};
      v2Category?: typeof r.v2Category & {};
    } = {
      text: r.text,
      category: r.category,
      importance: r.importance,
      keywords: r.keywords,
    };
    if (r.v2Importance) mapped.v2Importance = r.v2Importance;
    if (r.v2Category) mapped.v2Category = r.v2Category;
    return mapped;
  });
  const jdRecord = await writer.createJd(
    {
      title: payload.title,
      rawText: payload.rawText,
      ...(payload.company ? { company: payload.company } : {}),
      ...(payload.targetRole ? { targetRole: payload.targetRole } : {}),
      sourceKind: payload.sourceKind,
      sourceUrl: payload.sourceUrl,
      requirements,
      idempotencyKey: payload.idempotencyKey,
    },
    context.signal,
  );

  proposalStore.clear(payload.proposalId);
  recordProductAction("jd_import", "success", {
    requirementsCount: jdRecord.requirements.length,
    sourceKind: payload.sourceKind,
  });
  return {
    summary: `已保存岗位描述「${jdRecord.title}」到本地，等待同步`,
    details: {
      jdId: jdRecord.id,
      title: jdRecord.title,
      requirementsCount: jdRecord.requirements.length,
      jdHash: jdRecord.jdHash,
      syncStatus: jdRecord.syncStatus ?? "pending",
    },
  };
}

function readPayload(payload: unknown): JdSaveApprovalPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { proposalId?: unknown }).proposalId !== "string" ||
    typeof (payload as { rawText?: unknown }).rawText !== "string" ||
    typeof (payload as { title?: unknown }).title !== "string"
  ) {
    throw new Error("JD 保存审批 Payload 无效");
  }
  return structuredClone(payload as JdSaveApprovalPayload);
}
