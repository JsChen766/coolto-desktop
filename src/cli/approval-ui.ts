import type { Interface } from "node:readline/promises";
import { stdout } from "node:process";

import type { CooltoAgent } from "../agent/coolto-agent.js";
import type {
  ApprovalEvent,
  ApprovalRequest,
} from "../approvals/types.js";

export function renderApprovalEvent(event: ApprovalEvent): void {
  switch (event.type) {
    case "approval.required":
      renderRequest(event.request);
      break;
    case "approval.executing":
      stdout.write("\n[正在执行已接受的操作]\n");
      break;
    case "approval.completed":
      stdout.write(`\n[操作完成] ${event.summary}\n`);
      break;
    case "approval.failed":
      stdout.write(`\n[操作失败] ${event.message}\n`);
      break;
    case "approval.resolved":
      if (event.decision === "reject") {
        stdout.write("\n[已拒绝，本次操作未执行]\n");
      }
      break;
  }
}

export async function resolvePendingApprovals(
  agent: CooltoAgent,
  terminal: Interface,
): Promise<void> {
  while (true) {
    const request = agent.getPendingApprovals()[0];
    if (!request) {
      return;
    }
    const choice = (
      await terminal.question(
        "决策：[1] 接受并执行  [2] 拒绝  [3] 自定义回答\n选择> ",
      )
    ).trim();
    if (choice === "1") {
      await agent.resolveApproval(request.id, { type: "accept" });
      continue;
    }
    if (choice === "2") {
      await agent.resolveApproval(request.id, { type: "reject" });
      continue;
    }
    if (choice === "3") {
      const text = (
        await terminal.question("自定义回答> ")
      ).trim();
      if (text) {
        stdout.write("Agent> ");
        await agent.resolveApproval(request.id, {
          type: "custom",
          text,
        });
      }
      continue;
    }
    stdout.write("请输入 1、2 或 3。\n");
  }
}

function renderRequest(request: ApprovalRequest): void {
  stdout.write(`\n\n[待决策] ${request.title}\n`);
  stdout.write(`${request.description}\n`);
  for (const field of request.preview.summary) {
    stdout.write(`- ${field.label}：${field.value}\n`);
  }
  for (const item of request.preview.items ?? []) {
    stdout.write(`\n• ${item.title}\n`);
    for (const field of item.fields ?? []) {
      stdout.write(`  ${field.label}：${field.value}\n`);
    }
    if (item.description) {
      stdout.write(`  ${item.description}\n`);
    }
    if (item.warning) {
      stdout.write(`  注意：${item.warning}\n`);
    }
  }
  for (const field of request.preview.profileFields ?? []) {
    stdout.write(`\n• ${field.label}\n`);
    stdout.write(`  当前值：${field.currentValue ?? "（未填写）"}\n`);
    stdout.write(`  新值：${field.proposedValue}\n`);
  }
  for (const warning of request.preview.warnings ?? []) {
    stdout.write(`\n注意：${warning}\n`);
  }
}
