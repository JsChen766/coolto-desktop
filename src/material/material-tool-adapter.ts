import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ToolCapabilityMetadataV1 } from "../agent-task/tool-capability-types.js";
import type { MaterialHostPort, MaterialPrepareRelationInput } from "./material-host-contract.js";
import type { MaterialSearchOptions, MaterialView } from "./material-view.js";

export type MaterialCapabilityAgentTool = AgentTool & { capability: ToolCapabilityMetadataV1 };

type ToolExecutor = (id: string, params: unknown) => Promise<unknown>;
interface IdParams { materialId: string; }
interface OcrParams extends IdParams { correctedText?: string; }

const listParameters = Type.Object({
  query: Type.Optional(Type.String({ maxLength: 200 })),
  status: Type.Optional(Type.String({ maxLength: 40 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});
const idParameters = Type.Object({ materialId: Type.String({ minLength: 1, maxLength: 160 }) });
const relationParameters = Type.Object({
  materialId: Type.String({ minLength: 1, maxLength: 160 }),
  classification: Type.Union([Type.Literal("unclassified"), Type.Literal("classified")]),
  experienceReferences: Type.Array(Type.Object({
    experienceId: Type.String({ minLength: 1, maxLength: 160 }),
    citations: Type.Array(Type.Record(Type.String(), Type.Unknown()), { minItems: 1, maxItems: 200 }),
  }), { maxItems: 200 }),
});
const ocrParameters = Type.Object({
  materialId: Type.String({ minLength: 1, maxLength: 160 }),
  correctedText: Type.Optional(Type.String({ maxLength: 180000 })),
});

export function createMaterialToolAdapter(host: MaterialHostPort): MaterialCapabilityAgentTool[] {
  return [
    readTool("list_materials", "列出本地材料", "查询本机材料目录；不会把原始文件或完整 OCR 文本发送给 Agent。", listParameters, async (_id, params) => ({
      materials: (await host.materialTools.list(params as MaterialSearchOptions)).map(agentSafeView),
    })),
    readTool("get_material", "读取材料摘要", "读取一个本地材料的脱敏摘要、处理状态和引用计数。", idParameters, async (_id, params) => ({
      material: agentSafeView(await host.materialTools.get((params as IdParams).materialId)),
    })),
    atomicTool("prepare_material_relation", "准备材料经历关系", "为用户确认准备材料到多个 Experience 的引用提案；不会直接写入经历或 Outbox。", relationParameters, async (_id, params) => ({
      proposal: await host.materialTools.prepareRelation(params as MaterialPrepareRelationInput),
    })),
    atomicTool("prepare_material_delete", "预览材料删除影响", "展示受影响的 Experience 引用；不会删除材料或修改已发布资产。", idParameters, async (_id, params) => ({
      impact: await host.materialTools.prepareDelete((params as IdParams).materialId),
    })),
    atomicTool("confirm_material_ocr", "确认材料 OCR", "仅在用户明确确认或修正低置信 OCR 后调用。", ocrParameters, async (_id, params) => {
      const input = params as OcrParams;
      return { material: agentSafeView(await host.materialTools.confirmOcr(input.materialId, input.correctedText)) };
    }),
  ];
}
function agentSafeView(view: MaterialView | undefined): MaterialView | undefined {
  if (!view) return undefined;
  return { ...view, previewText: null, previewTruncated: false };
}

function readTool<T extends object>(
  name: string,
  label: string,
  description: string,
  parameters: T,
  execute: ToolExecutor,
): MaterialCapabilityAgentTool {
  return tool(name, label, description, parameters, execute, "read", "R0", "parallel", "none", false);
}

function atomicTool<T extends object>(
  name: string,
  label: string,
  description: string,
  parameters: T,
  execute: ToolExecutor,
): MaterialCapabilityAgentTool {
  return tool(name, label, description, parameters, execute, "reversible", "R1", "sequential", "request_key", true);
}

function tool<T extends object>(
  name: string,
  label: string,
  description: string,
  parameters: T,
  execute: ToolExecutor,
  sideEffect: ToolCapabilityMetadataV1["sideEffect"],
  risk: ToolCapabilityMetadataV1["risk"],
  concurrency: ToolCapabilityMetadataV1["concurrency"],
  idempotency: ToolCapabilityMetadataV1["idempotency"],
  requiresFreshObservation: boolean,
): MaterialCapabilityAgentTool {
  return {
    name, label, description, parameters,
    execute: async (toolCallId, params) => {
      const data = await execute(toolCallId, params);
      const result = { status: "succeeded" as const, data, receiptId: null, errorCode: null, message: `${label}已完成` };
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
    capability: {
      sideEffect, risk, requiredScopes: ["material:local"], concurrency,
      idempotency, evidence: "action_receipt", requiresFreshObservation,
      unattendedAllowed: false,
    },
  } as MaterialCapabilityAgentTool;
}
