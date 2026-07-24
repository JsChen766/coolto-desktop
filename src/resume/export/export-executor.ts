import type {
  ActionExecutionContext,
  ActionExecutor,
} from "../../approvals/executor-registry.js";
import type {
  ResumePdfExportApprovalPayload,
  ResumePdfExportGateway,
} from "./types.js";

export function createResumePdfExportExecutor(
  gateway: ResumePdfExportGateway,
): ActionExecutor {
  return {
    execute: async (context) => executeExport(context, gateway),
  };
}

async function executeExport(
  context: ActionExecutionContext,
  gateway: ResumePdfExportGateway,
) {
  const payload = readPayload(context.payload);
  const result = await gateway.exportPdf(payload, context.signal);
  if (result.status === "cancelled") {
    return {
      summary: "已取消 PDF 导出，没有创建文件。",
      details: { proposalId: payload.proposalId, status: result.status },
    };
  }
  return {
    summary: `PDF 已导出：${result.filename}`,
    details: {
      proposalId: payload.proposalId,
      status: result.status,
      filePath: result.filePath,
      bytes: result.bytes,
      sha256: result.sha256,
      pageCount: result.pageCount,
      embeddedFontNames: result.embeddedFontNames,
    },
  };
}

function readPayload(payload: unknown): ResumePdfExportApprovalPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { proposalId?: unknown }).proposalId !== "string" ||
    typeof (payload as { structureHash?: unknown }).structureHash !== "string"
  ) {
    throw new Error("PDF export approval payload is invalid");
  }
  return structuredClone(payload as ResumePdfExportApprovalPayload);
}
