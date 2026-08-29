import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { canonicalHash } from "../src/agent-task/canonical-hash.js";
import type { JsonValue } from "../src/agent-task/json-types.js";
import { TaskLifecycleController } from
  "../src/agent-task/task-lifecycle-controller.js";
import { createCooltoAgent } from "../src/agent/create-agent.js";
import { createConfiguredModelDependencies } from
  "../src/agent/create-configured-dependencies.js";
import { SYSTEM_PROMPT_VERSION } from "../src/agent/system-prompt.js";
import { CooltoApiClient } from "../src/api/coolto-api-client.js";
import { KeychainSessionStore } from "../src/auth/keychain-session-store.js";
import { ensureAuthenticated } from "../src/auth/session-manager.js";
import { performEmailOtpLogin } from "../src/cli/login.js";
import { loadLocalEnv, readConfig } from "../src/config.js";
import { filterApplications } from
  "../src/desktop/main/application-library/application-sync-mapping.js";
import { InboxApplicationCandidateReader } from
  "../src/inbox-signals/inbox-application-candidate-reader.js";
import {
  inboxAssociationMetrics,
  type InboxAssociationDecision,
} from "../src/inbox-signals/inbox-association-metrics.js";
import { InboxSignalController } from
  "../src/inbox-signals/inbox-signal-controller.js";
import { createToolRegistry } from "../src/tools/registry.js";
import {
  applicationRecords,
  loadInboxAssociationCases,
  MemoryEvalEvidenceStore,
  messagePayload,
  type InboxAssociationEvalCase,
} from "./support/inbox-association-eval-cases.js";

loadLocalEnv();
const inputPath = argument("--input");
if (!inputPath) throw new Error("用 --input 指定本地 JSONL 评测集");
const cases = await loadInboxAssociationCases(resolve(inputPath));
const config = readConfig();
const apiClient = new CooltoApiClient({ baseUrl: config.apiBaseUrl });
const sessionStore = new KeychainSessionStore({ apiBaseUrl: config.apiBaseUrl });
await ensureAuthenticated(
  apiClient, sessionStore, config.apiBaseUrl, performEmailOtpLogin,
);
const modelDependencies = createConfiguredModelDependencies(
  config,
  () => apiClient.getSessionToken(),
);
const reports = [];
for (const evalCase of cases) reports.push(await runCase(evalCase));
const metrics = inboxAssociationMetrics(reports.map((report) => report.decision));
const kindMatches = reports.filter((report) => report.kindCorrect).length;
const controlledSmokePassed = reports.length > 0 && reports.every((report) =>
  report.runtimeError === null && report.signalRecorded &&
  report.associationCorrect && report.kindCorrect);
const summary = {
  passed: metrics.passed,
  controlledSmokePassed,
  modelId: config.modelId,
  systemPromptVersion: SYSTEM_PROMPT_VERSION,
  metrics,
  kindAccuracy: reports.length ? kindMatches / reports.length : 0,
  reports: reports.map(({ decision: _decision, ...report }) => report),
};
const outputPath = argument("--output");
if (outputPath) {
  const absolute = resolve(outputPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(summary, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!summary.passed &&
    !(process.argv.includes("--allow-small") && controlledSmokePassed)) {
  process.exitCode = 1;
}

async function runCase(evalCase: InboxAssociationEvalCase) {
  const ownerId = `eval-owner-${evalCase.id}`;
  const evidence = new MemoryEvalEvidenceStore(ownerId);
  const harness = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(
      ownerId,
      new MemoryAgentHarnessStatePersistence(),
    ),
    evidence,
  );
  const task = await harness.tasks.create("eval-conversation", "处理招聘邮件信号");
  const now = Date.now();
  await harness.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: [], blockedDomains: [],
    allowedActions: [
      "mail.read", "mail.classify", "tracker.application.read", "task.lifecycle",
    ],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, connectorPolicy: {},
    submissionBudget: {}, unattended: false,
    validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
    policyVersion: "be5-eval", confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const running = await harness.tasks.get(task.id);
  const message = messagePayload(evalCase);
  const payloadHash = canonicalHash(message as unknown as JsonValue);
  const stored = await evidence.save({
    taskId: task.id, runId: running.activeRunId!, kind: "connector_payload",
    payloadHash, payload: message as unknown as JsonValue,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
  });
  const event = await harness.events.enqueue({
    taskId: task.id, source: "mail", type: "mail.message_received",
    trust: "external_untrusted", occurredAt: message.receivedAt,
    dedupeKey: `eval:${evalCase.id}`, payloadRef: stored.id, payloadHash,
  });
  await harness.events.markDelivered(event.id);
  const applications = applicationRecords(evalCase);
  const source = {
    listApplications: async (options: Parameters<typeof filterApplications>[1]) =>
      filterApplications(applications.records, options),
    getApplication: async (id: string) => {
      const found = applications.records.find((item) => item.id === id);
      if (!found) throw new Error("Application 不存在");
      return structuredClone(found);
    },
  };
  const controller = new InboxSignalController(
    "eval-conversation", harness,
    { get: async () => { throw new Error("评测不读取外部邮箱连接"); } },
    [], source,
  );
  const candidates = new InboxApplicationCandidateReader(
    "eval-conversation", harness, source,
  );
  const tools = createToolRegistry({
    inboxSignals: controller,
    inboxApplicationCandidates: candidates,
    agentTaskLifecycle: new TaskLifecycleController("eval-conversation", harness),
  });
  const agent = createCooltoAgent({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    modelId: config.modelId,
    tools,
  }, modelDependencies);
  const startedAt = performance.now();
  let runtimeError: string | null = null;
  try {
    await agent.prompt(
      `请处理当前任务收到的邮件事件 ${event.id}，完成求职邮件分类和 Application 关联。` +
      "必须读取邮件和候选；无法唯一判断时留空。完成后简短报告。",
    );
  } catch (error: unknown) {
    runtimeError = error instanceof Error ? error.message : String(error);
  }
  const signals = await harness.signals.list(task.id);
  const signal = signals.find((item) => item.eventId === event.id);
  const expectedId = evalCase.expectedApplicationKey
    ? applications.idByKey.get(evalCase.expectedApplicationKey) ?? null
    : null;
  const actualId = runtimeError
    ? "__runtime_error__"
    : signal ? signal.applicationId : "__missing_signal__";
  const decision: InboxAssociationDecision = {
    caseId: evalCase.id,
    provider: evalCase.provider,
    expectedApplicationId: expectedId,
    actualApplicationId: actualId,
    confidence: signal?.confidence ?? null,
  };
  const messages = agent.getMessages();
  return {
    caseId: evalCase.id,
    provider: evalCase.provider,
    expectedLinked: expectedId !== null,
    actualLinked: signal?.applicationId != null,
    associationCorrect: expectedId === actualId,
    confidence: signal?.confidence ?? null,
    actualKind: signal?.kind ?? null,
    kindCorrect: signal?.kind === evalCase.expectedKind,
    toolNames: toolCalls(messages),
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
    runtimeError,
    signalRecorded: Boolean(signal),
    decision,
  };
}

function toolCalls(messages: AgentMessage[]): string[] {
  return messages.flatMap((message) => message.role === "assistant"
    ? message.content.flatMap((content) =>
        content.type === "toolCall" ? [content.name] : [])
    : []);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
