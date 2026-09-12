import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { DesktopAuthService } from "./auth-service.js";

let compactionThresholdCache: number | undefined;

export async function readCompactionThreshold(
  apiClient: CooltoApiClient,
): Promise<number | undefined> {
  if (compactionThresholdCache !== undefined) return compactionThresholdCache;
  try {
    const config = await apiClient.getAppConfig();
    compactionThresholdCache = config.contextCompactThresholdTokens;
  } catch {
    compactionThresholdCache = undefined;
  }
  return compactionThresholdCache;
}

export async function runSyncNow(
  auth: DesktopAuthService,
): Promise<{ ok: boolean; message: string }> {
  try {
    await auth.syncNow();
    return { ok: true, message: "本地数据已同步到云端。" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `同步失败：${message}` };
  }
}
