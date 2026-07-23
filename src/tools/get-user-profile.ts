import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { UserProfileReader } from "../api/types.js";

export function createGetUserProfileTool(
  profileReader: UserProfileReader,
): AgentTool {
  return {
    name: "get_user_profile",
    label: "读取求职资料",
    description:
      "读取当前登录用户的姓名、联系方式、所在地、求职偏好等 profile。生成简历固定 header 或确认目标语言时使用；不读取经历、JD 或简历。",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params, signal) => {
      const profile = await profileReader.getUserProfile(signal);
      return {
        content: [{ type: "text", text: JSON.stringify(profile) }],
        details: profile,
      };
    },
  };
}
