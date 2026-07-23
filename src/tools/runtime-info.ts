import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

export interface RuntimeInfo {
  runtime: "local-pi-agent";
  architecture: "single-agent";
  input: "natural-language";
  cloudLangGraphUsed: false;
  persistentAssetCacheEnabled: false;
  implementedBusinessTools: string[];
}

export function createRuntimeInfoTool(
  implementedBusinessTools: string[] = [],
): AgentTool {
  const runtimeInfo: RuntimeInfo = {
    runtime: "local-pi-agent",
    architecture: "single-agent",
    input: "natural-language",
    cloudLangGraphUsed: false,
    persistentAssetCacheEnabled: false,
    implementedBusinessTools,
  };

  return {
    name: "get_runtime_info",
    label: "查看本地 Agent 能力",
    description:
      "仅当用户询问当前本地 Agent 的架构、运行模式或已经实现的工具能力时使用。不要把它用于读取用户经历、JD、简历或投递记录。",
    parameters: Type.Object({}),
    execute: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(runtimeInfo),
        },
      ],
      details: runtimeInfo,
    }),
  };
}
