import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  configureLocalDiagnostics,
  localDiagnosticsLogPath,
  recentLocalDiagnostics,
  recordLocalDiagnostic,
} from "../src/diagnostics/local-event-log.js";
import {
  redactDiagnosticText,
  sanitizeDiagnosticDetail,
} from "../src/diagnostics/sanitize.js";
import {
  recordManagedTaskStatus,
  recordProductAction,
} from "../src/diagnostics/record-product-action.js";

test("sanitize drops bodies and redacts secrets and home paths", () => {
  const detail = sanitizeDiagnosticDetail({
    tool: "prepare_jd_import",
    content: "SECRET RESUME BODY",
    apiKey: "sk-abcdefghijklmnopqrstuvwxyz",
    note: "Bearer abcdefghijklmnop and /home/box/secret.pdf",
    count: 2,
  });
  assert.deepEqual(detail, {
    tool: "prepare_jd_import",
    note: "[redacted] and [redacted]",
    count: 2,
  });
  const redacted = redactDiagnosticText("token sk-live-should-hide-value");
  assert.doesNotMatch(redacted, /sk-live/u);
  assert.match(redacted, /\[redacted\]/u);
});

test("local diagnostic ring records metadata-only timeline events", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-diag-"));
  configureLocalDiagnostics(root);
  recordLocalDiagnostic({
    action: "app_start",
    phase: "success",
    detail: { platform: "linux" },
  });
  recordLocalDiagnostic({
    action: "experience_import",
    phase: "started",
  });
  recordLocalDiagnostic({
    action: "jd_import",
    phase: "success",
  });
  recordLocalDiagnostic({
    action: "resume_generation",
    phase: "success",
    detail: { content: "should-not-persist" },
  });
  const recent = recentLocalDiagnostics();
  assert.equal(recent.length, 4);
  assert.equal(recent[0]?.action, "app_start");
  assert.equal(recent[3]?.action, "resume_generation");
  assert.equal(recent[3]?.detail?.content, undefined);
  // Allow async JSONL flush
  await new Promise((resolve) => setTimeout(resolve, 50));
  const path = localDiagnosticsLogPath();
  assert.ok(path);
  const body = await readFile(path!, "utf8");
  assert.match(body, /"action":"app_start"/u);
  assert.doesNotMatch(body, /should-not-persist/u);
  assert.doesNotMatch(body, /\bsk-[A-Za-z0-9]/u);
});

test("product action helpers cover defined OSS timeline actions", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-diag-actions-"));
  configureLocalDiagnostics(root);
  const before = recentLocalDiagnostics().length;
  recordProductAction("match_analysis", "success", { finalScore: 0.8 });
  recordProductAction("resume_export", "success", { pageCount: 1 });
  recordManagedTaskStatus("queued", { taskId: "task-1" });
  recordManagedTaskStatus("waiting", { taskId: "task-1" });
  recordManagedTaskStatus("completed", { taskId: "task-1" });
  recordManagedTaskStatus("failed", { taskId: "task-2" });
  const recent = recentLocalDiagnostics().slice(before);
  const actions = recent.map((event) => `${event.action}:${event.phase}`);
  assert.deepEqual(actions, [
    "match_analysis:success",
    "resume_export:success",
    "managed_task:started",
    "managed_task:waiting_user",
    "managed_task:success",
    "managed_task:failure",
  ]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const body = await readFile(localDiagnosticsLogPath()!, "utf8");
  assert.match(body, /"action":"managed_task"/u);
  assert.match(body, /"action":"match_analysis"/u);
  assert.doesNotMatch(body, /\bsk-[A-Za-z0-9]/u);
  assert.doesNotMatch(body, /should-not-persist|SECRET RESUME/u);
});
