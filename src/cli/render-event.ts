import { stdout } from "node:process";

import type { CooltoAgentEvent } from "../agent/events.js";
import { renderApprovalEvent } from "./approval-ui.js";

export function renderEvent(event: CooltoAgentEvent): void {
  switch (event.type) {
    case "message.delta":
      stdout.write(event.text);
      break;
    case "tool.started":
      stdout.write(`\n[工具] ${event.name}\n`);
      break;
    case "tool.completed":
      if (event.isError) {
        stdout.write(`[工具失败] ${event.name}\n`);
      }
      break;
    case "run.failed":
      stdout.write(`\n[失败] ${event.message}\n`);
      break;
    case "run.completed":
      stdout.write("\n");
      break;
    case "approval.required":
    case "approval.resolved":
    case "approval.executing":
    case "approval.completed":
    case "approval.failed":
      renderApprovalEvent(event);
      break;
    default:
      break;
  }
}
