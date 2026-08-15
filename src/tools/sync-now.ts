import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

/** Result of one sync round, summarized for the agent transcript. */
export interface SyncNowResult {
  ok: boolean;
  message: string;
}

export function createSyncNowTool(
  syncNow: () => Promise<SyncNowResult>,
): AgentTool {
  return {
    name: "sync_now",
    label: "同步本地数据到云端",
    description:
      "立即把本地待同步的数据（经历、简历、JD、投递等）推送到云端并拉取最新变更。" +
      "当用户询问数据是否已同步、要求同步、或本地刚完成编辑后想确认云端一致时使用。" +
      "通常无需参数；执行后返回同步结果摘要。",
    parameters: Type.Object({}),
    execute: async () => {
      const result = await syncNow();
      return {
        content: [
          {
            type: "text",
            text: result.message,
          },
        ],
        details: result,
      };
    },
  };
}
