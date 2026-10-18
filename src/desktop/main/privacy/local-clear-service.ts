import { recordLocalDiagnostic } from "../../../diagnostics/local-event-log.js";
export interface LocalClearScope {
  apiBaseUrl: string;
  ownerId: string;
  scopeDigest: string;
}
export type LocalClearStatus = "cleared" | "partial_failure" | "blocked";

export interface LocalClearResult {
  status: LocalClearStatus;
  cloudAssets: "preserved";
  cleared: string[];
  failed: Array<{ scope: string; code: string }>;
}

export interface LocalClearOperations {
  agentRunning: boolean;
  accountEmail?: string;
  scope?: LocalClearScope;
  quiesce(): Promise<void>;
  clearSync(): Promise<void>;
  clearBusiness(): Promise<void>;
  clearBrowser(scope?: LocalClearScope): Promise<void>;
  clearRendererStorage(): Promise<void>;
  clearSession(): Promise<void>;
  clearDeviceIdentity(accountEmail?: string): Promise<void>;
}

export async function executeLocalClear(
  operations: LocalClearOperations,
): Promise<LocalClearResult> {
  if (operations.agentRunning) {
    recordLocalDiagnostic({
      action: "data_clear",
      phase: "cancelled",
      detail: { reason: "agent_running" },
    });
    return {
      status: "blocked",
      cloudAssets: "preserved",
      cleared: [],
      failed: [{ scope: "agent", code: "agent_running" }],
    };
  }
  await operations.quiesce();
  const cleared: string[] = [];
  const failed: Array<{ scope: string; code: string }> = [];
  await runScope("sync", operations.clearSync, cleared, failed);
  await runScope("business", operations.clearBusiness, cleared, failed);
  await runScope("browser", () => operations.clearBrowser(operations.scope), cleared, failed);
  await runScope("renderer", operations.clearRendererStorage, cleared, failed);
  await runScope(
    "device_identity",
    () => operations.clearDeviceIdentity(operations.accountEmail),
    cleared,
    failed,
  );
  if (failed.length === 0) {
    await runScope("session", operations.clearSession, cleared, failed);
  }
  const status = failed.length === 0 ? "cleared" : "partial_failure";
  recordLocalDiagnostic({
    action: "data_clear",
    phase: status === "cleared" ? "success" : "failure",
    detail: { clearedCount: cleared.length, failedCount: failed.length },
  });
  return {
    status,
    cloudAssets: "preserved",
    cleared,
    failed,
  };
}

async function runScope(
  scope: string,
  action: () => Promise<void>,
  cleared: string[],
  failed: Array<{ scope: string; code: string }>,
): Promise<void> {
  try {
    await action();
    cleared.push(scope);
  } catch (error: unknown) {
    failed.push({ scope, code: errorCode(error) });
  }
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "local_clear_failed";
  }
  const code = Reflect.get(error, "code");
  return typeof code === "string" && code.trim()
    ? code
    : "local_clear_failed";
}
