import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ApplicationSubmissionService } from "../desktop/main/agent-task/application-submission-service.js";

const prepareParameters = Type.Object({
  jdId: Type.String({ minLength: 1, maxLength: 200 }),
  resumeId: Type.String({ minLength: 1, maxLength: 200 }),
  targetUrl: Type.String({ minLength: 1, maxLength: 4096 }),
  submitFillId: Type.String({ minLength: 1, maxLength: 200 }),
});
const submitParameters = Type.Object({
  intentId: Type.String({ minLength: 1, maxLength: 200 }),
  confirmationKind: Type.Union([
    Type.Literal("url"), Type.Literal("text"), Type.Literal("element"),
  ]),
  confirmationValue: Type.String({ minLength: 1, maxLength: 2000 }),
  timeoutMs: Type.Optional(Type.Number({ minimum: 100, maximum: 30_000 })),
});
const syncParameters = Type.Object({
  receiptId: Type.String({ minLength: 1, maxLength: 200 }),
});

export function createApplicationSubmissionTools(
  service: ApplicationSubmissionService,
): AgentTool[] {
  return [
    {
      name: "prepare_application_submission",
      label: "准备受控投递",
      description:
        "在最终提交前冻结正式 JD、实际 Resume、quality/hash、当前 tab/origin、submit fillId 和" +
        "既有 Application Proposal，拒绝重复投递并签发 2 分钟 SubmissionToken。不会点击提交。",
      parameters: prepareParameters,
      executionMode: "sequential",
      execute: async (_id, input) => {
        const intent = await service.prepare(input as never);
        return {
          content: [{ type: "text", text: JSON.stringify({
            intentId: intent.id,
            actionTokenId: intent.actionTokenId,
            expiresAt: intent.expiresAt,
            instruction: "仅可在页面未变化且 Grant 有效时调用 browser_submit。",
          }) }],
          details: intent,
        };
      },
    },
    {
      name: "browser_submit",
      label: "提交岗位申请",
      description:
        "消费 prepare_application_submission 返回的短时 intent，只点击已验证 submit 控件，" +
        "等待确认页并生成 SubmissionReceipt；普通 click/keypress 永远不能替代本工具。",
      parameters: submitParameters,
      executionMode: "sequential",
      execute: async (_id, input) => {
        const receipt = await service.submit(input as never);
        return {
          content: [{ type: "text", text: JSON.stringify(receipt) }],
          details: receipt,
        };
      },
    },
    {
      name: "sync_submission_receipt",
      label: "同步投递回执到 Tracker",
      description:
        "当站点投递已发生但 Tracker 写入失败时，重放既有不可变 Application Proposal/Outbox。" +
        "不会再次点击站点提交。",
      parameters: syncParameters,
      executionMode: "sequential",
      execute: async (_id, input) => {
        const receipt = await service.syncReceipt(
          (input as { receiptId: string }).receiptId,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(receipt) }],
          details: receipt,
        };
      },
    },
  ];
}
