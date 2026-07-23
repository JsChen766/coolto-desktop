import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { CurrentUserReader } from "../api/types.js";

export function createGetCurrentUserTool(
  currentUserReader: CurrentUserReader,
): AgentTool {
  return {
    name: "get_current_user",
    label: "读取当前登录用户",
    description:
      "当需要确认当前登录账号、用户 ID 或登录邮箱时使用。只读取当前会话对应的用户，不用于读取简历、经历、JD 或其他用户。",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params, signal) => {
      const user = await currentUserReader.getCurrentUser(signal);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(user),
          },
        ],
        details: user,
      };
    },
  };
}
