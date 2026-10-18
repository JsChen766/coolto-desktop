import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { sanitizeDiagnosticDetail } from "./sanitize.js";
import type {
  LocalDiagnosticAction,
  LocalDiagnosticEvent,
  LocalDiagnosticPhase,
} from "./types.js";

export type {
  LocalDiagnosticAction,
  LocalDiagnosticEvent,
  LocalDiagnosticPhase,
} from "./types.js";

const RING_MAX = 200;
const ring: LocalDiagnosticEvent[] = [];
let logDirectory: string | undefined;
let writeChain: Promise<void> = Promise.resolve();

export function configureLocalDiagnostics(userDataPath: string): void {
  logDirectory = join(userDataPath, "diagnostics");
}

export function localDiagnosticsLogPath(): string | undefined {
  return logDirectory ? join(logDirectory, "events.jsonl") : undefined;
}

export function recentLocalDiagnostics(limit = 50): readonly LocalDiagnosticEvent[] {
  return ring.slice(Math.max(0, ring.length - limit));
}

export interface RecordLocalDiagnosticInput {
  action: LocalDiagnosticAction;
  phase: LocalDiagnosticPhase;
  detail?: Record<string, unknown>;
}

/** Append a metadata-only diagnostic event (memory ring + optional JSONL). */
export function recordLocalDiagnostic(input: RecordLocalDiagnosticInput): void {
  const detail = sanitizeDiagnosticDetail(input.detail);
  const event: LocalDiagnosticEvent = {
    schemaVersion: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    action: input.action,
    phase: input.phase,
    ...(detail ? { detail } : {}),
  };
  ring.push(event);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  const path = localDiagnosticsLogPath();
  if (!path || !logDirectory) return;
  const directory = logDirectory;
  writeChain = writeChain.then(async () => {
    await mkdir(directory, { recursive: true });
    await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
  }).catch(() => undefined);
}
