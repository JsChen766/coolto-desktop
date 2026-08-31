import { writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";

const reportPath = process.env.COOLTO_BROWSER_QA_REPORT;

export function initializeBrowserAgentQaReport(electronAppType: string): void {
  if (!reportPath) return;
  writeFileSync(reportPath, JSON.stringify({
    started: true,
    electronAppType,
    electronVersion: process.versions.electron ?? null,
  }), "utf8");
}

export function writeBrowserAgentQaReport(value: unknown): Promise<void> {
  return reportPath
    ? writeFile(reportPath, JSON.stringify(value, null, 2), "utf8")
    : Promise.resolve();
}
