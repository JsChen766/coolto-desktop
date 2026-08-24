import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { TaskLifecycleController } from "../agent-task/task-lifecycle-controller.js";

const summary = Type.String({ minLength: 1, maxLength: 2000 });
const checkpointParameters = Type.Object({ summary });
const waitParameters = Type.Object({
  reason: Type.Union([
    Type.Literal("timer"), Type.Literal("external_event"),
    Type.Literal("approval"), Type.Literal("takeover"), Type.Literal("answer"),
  ]),
  wakeAfter: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  eventTypes: Type.Optional(Type.Array(Type.String({ maxLength: 200 }), { maxItems: 20 })),
  summary,
});
const completeParameters = Type.Object({
  partial: Type.Optional(Type.Boolean()),
  summary,
});

export function createAgentTaskLifecycleTools(
  controller: TaskLifecycleController,
): AgentTool[] {
  return [
    {
      name: "task_checkpoint", label: "保存 Agent 任务检查点",
      description:
        "保存当前通用任务进度和已处理事件/回执游标，不结束 run；不得包含密码、OTP、Cookie、" +
        "完整 DOM、邮件正文或业务资产副本。",
      parameters: checkpointParameters,
      execute: async (_id, input) => {
        const value = await controller.checkpoint(input as { summary: string });
        return { content: [{ type: "text", text: `检查点已保存：${value.id}` }], details: value };
      },
    },
    {
      name: "task_wait", label: "等待 Agent 任务条件",
      description:
        "由 Agent 决定任务等待 timer/external event/approval/takeover/answer。" +
        "必须是本条 assistant message 的唯一工具调用；成功后结束当前 run。",
      parameters: waitParameters,
      execute: async (_id, input) => {
        const value = await controller.wait(input as never);
        return { content: [{ type: "text", text: "任务已进入等待。" }], details: value,
          terminate: true };
      },
    },
    {
      name: "task_need_user", label: "请求用户处理 Agent 任务",
      description:
        "任务需要用户回答、接管或审批时进入等待；不替用户生成答案。" +
        "必须是本条 assistant message 的唯一工具调用。",
      parameters: Type.Object({
        reason: Type.Union([
          Type.Literal("approval"), Type.Literal("takeover"), Type.Literal("answer"),
        ]),
        summary,
      }),
      execute: async (_id, input) => {
        const value = input as { reason: "approval" | "takeover" | "answer"; summary: string };
        const task = await controller.wait({ ...value, eventTypes: ["user.response"] });
        return { content: [{ type: "text", text: "任务已暂停并等待用户。" }], details: task,
          terminate: true };
      },
    },
    {
      name: "task_complete", label: "结束 Agent 任务",
      description:
        "由 Agent 声明任务完整或部分完成，并冻结最终检查点。" +
        "必须是本条 assistant message 的唯一工具调用。",
      parameters: completeParameters,
      execute: async (_id, input) => {
        const value = input as { partial?: boolean; summary: string };
        const task = await controller.complete({ partial: value.partial ?? false,
          summary: value.summary });
        return { content: [{ type: "text", text: "任务已结束。" }], details: task,
          terminate: true };
      },
    },
  ];
}
