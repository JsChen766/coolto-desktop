#!/usr/bin/env node

import { appendFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { createActionApprovalManager } from "../actions/create-action-approvals.js";
import { createCooltoAgent } from "../agent/create-agent.js";
import { createConfiguredModelDependencies } from "../agent/create-configured-dependencies.js";
import { CooltoApiClient } from "../api/coolto-api-client.js";
import { FileSessionStore } from "../auth/file-session-store.js";
import { KeychainSessionStore } from "../auth/keychain-session-store.js";
import { ensureAuthenticated } from "../auth/session-manager.js";
import { loadLocalEnv, readConfig } from "../config.js";
import { SelectedFileRegistry } from "../files/selected-file-registry.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";
import { JdProposalStore } from "../jd/proposal-store.js";
import { ResumeAlternativeRepairer } from "../resume/quality/alternative-repairer.js";
import { ResumeCandidateReviewer } from "../resume/quality/candidate-reviewer.js";
import { ResumeQualityEvaluator } from "../resume/quality/quality-evaluator.js";
import { ResumeSourceSnapshotBuilder } from "../resume/source-snapshot.js";
import { ResumeCandidatePatcher } from "../resume/workspace/candidate-patcher.js";
import { ResumeWorkspaceStore } from "../resume/workspace/workspace-store.js";
import { createToolRegistry } from "../tools/registry.js";
import { CliSemanticCompiler } from "./semantic-compiler.js";
import { createCliProfileProposalExecutor } from "./cli-profile-proposals.js";
import { cliDeviceId } from "./cli-profile-writer.js";
import {
  continueUntilTerminal,
  DEFAULT_CONTINUATION_BUDGET,
  INITIAL_TURN_MAX_MS,
  UNLIMITED_CONTINUATION_BUDGET,
} from "../desktop/main/resume-continuation.js";
import {
  resolvePendingApprovals,
} from "./approval-ui.js";
import { parseCliArguments } from "./args.js";
import { performEmailOtpLogin } from "./login.js";
import { renderEvent } from "./render-event.js";
import type { ResumeCompiler } from "../resume/workspace/compiler-port.js";

/**
 * Shared CLI runtime. The compiler is injected so the same loop can run on
 * the fast in-process estimator (node dev) or the real Chromium renderer
 * (electron entry) — the latter is the source of truth for layout gates.
 */
export async function runCli(compiler: ResumeCompiler): Promise<void> {
  loadLocalEnv();
  const config = readConfig();
  const cliArguments = await parseCliArguments(process.argv.slice(2));
  const apiClient = new CooltoApiClient({
    baseUrl: config.apiBaseUrl,
  });
  const sessionStore = cliArguments.sessionFile
    ? new FileSessionStore(cliArguments.sessionFile)
    : new KeychainSessionStore({
        apiBaseUrl: config.apiBaseUrl,
      });
  const authenticated = await ensureAuthenticated(
    apiClient,
    sessionStore,
    config.apiBaseUrl,
    async (client) => performEmailOtpLogin(client, await cliDeviceId()),
  );
  stdout.write(
    authenticated.restored
      ? `已自动登录 Coolto：${authenticated.user.email}\n`
      : `已登录 Coolto：${authenticated.user.email}（Session 已保存到系统安全凭据库）\n`,
  );

  const selectedFiles = new SelectedFileRegistry();
  const registeredFiles = await selectedFiles.registerPaths(
    cliArguments.attachmentPaths,
  );
  if (registeredFiles.length > 0) {
    stdout.write(
      `已选择附件：${registeredFiles.map((file) => file.filename).join("、")}\n`,
    );
  }
  const importProposalStore = new ExperienceImportProposalStore();
  const jdProposalStore = new JdProposalStore();
  const profileProposals = createCliProfileProposalExecutor(
    apiClient,
    authenticated.user.deviceId,
  );
  const approvalManager = createActionApprovalManager({
    experienceWriter: apiClient,
    importProposalStore,
    profileProposals,
    jdWriter: apiClient,
    jdProposalStore,
    resumePublications: apiClient.resumes,
  });
  const resumeSourceSnapshotBuilder = new ResumeSourceSnapshotBuilder({
    currentUser: apiClient,
    profile: apiClient,
    jd: apiClient,
    experience: apiClient,
  });
  const modelDependencies = createConfiguredModelDependencies(
    config,
    () => apiClient.getSessionToken(),
  );
  const resumeWorkspaceStore = new ResumeWorkspaceStore();
  const resumeCandidatePatcher = new ResumeCandidatePatcher(
    compiler,
    resumeWorkspaceStore,
  );
  const resumeCandidateReviewer = new ResumeCandidateReviewer(
    new ResumeQualityEvaluator(),
    resumeWorkspaceStore,
  );
  const resumeAlternativeRepairer = new ResumeAlternativeRepairer(
    compiler,
    new ResumeQualityEvaluator(),
    resumeWorkspaceStore,
  );
  const agent = createCooltoAgent({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    modelId: config.modelId,
    approvalManager,
    tools: createToolRegistry({
      currentUserReader: apiClient,
      userProfileReader: apiClient,
      profileProposals,
      experienceReader: apiClient,
      jdReader: apiClient,
      resumeReader: apiClient.resumes,
      resumeSourceSnapshotBuilder,
      importProposalStore,
      jdProposalStore,
      approvalManager,
      selectedFileRegistry: selectedFiles,
      agentOrchestrated: {
        snapshotBuilder: resumeSourceSnapshotBuilder,
        compiler,
        store: resumeWorkspaceStore,
        reviewer: resumeCandidateReviewer,
      },
      resumeCandidatePatcher,
      resumeCandidateReviewer,
      resumeAlternativeRepairer,
    }),
  }, modelDependencies);

  agent.subscribe((event) => {
    renderEvent(event);
  });

  const oneShotInput = cliArguments.prompt;
  if (oneShotInput) {
    // --no-timeout is the production mode: the 5-minute gate is a target for
    // testing, but a real run must finish the resume even if it takes longer.
    // Only per-turn hang protection and a generous call cap remain.
    const unlimited = cliArguments.noTimeout === true;
    const maxMs = unlimited
      ? Number.POSITIVE_INFINITY
      : (cliArguments.maxMinutes ?? DEFAULT_MAX_MINUTES) * 60_000;
    const startedAtMs = performance.now();
    // Reserve a 30s margin so a final in-flight continuation round can never
    // push the wall-clock total past maxMinutes (bounded mode only).
    const continuationMaxMs = unlimited
      ? Number.POSITIVE_INFINITY
      : Math.max(60_000, maxMs - 30_000);
    const initialPromptMaxMs = unlimited
      ? INITIAL_TURN_MAX_MS
      : INITIAL_PROMPT_MAX_MS;
    // The initial prompt is time-capped (soft): if it overruns, it is
    // cancelled but the run still continues through the continuation budget,
    // which measures from the command start so the total stays ≤ maxMinutes
    // in bounded mode; unlimited mode hands over to continuation instead of
    // aborting so the resume still completes.
    const unsubscribeBudget = agent.subscribe((event) => {
      if (
        event.type === "model.started" &&
        performance.now() - startedAtMs >= initialPromptMaxMs
      ) {
        agent.cancel();
      }
    });
    await agent.prompt(oneShotInput);
    unsubscribeBudget();
    if (performance.now() - startedAtMs >= initialPromptMaxMs) {
      stdout.write(
        `\n[预算] 初始回合超过 ${initialPromptMaxMs / 1000}s，已截断并转入续跑。\n`,
      );
    }
    // A soft-cancelled initial turn may still be flushing its stream; wait
    // until the agent is idle before the continuation prompts, otherwise the
    // next prompt() rejects with "already processing".
    while (agent.isRunning) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (cliArguments.autoApprove) {
      await autoApproveUntilTerminal(
        agent,
        resumeWorkspaceStore,
        compiler,
        {
          ...(unlimited ? UNLIMITED_CONTINUATION_BUDGET : {}),
          maxMs: continuationMaxMs,
          startedAtMs,
          maxModelCalls: unlimited
            ? UNLIMITED_CONTINUATION_BUDGET.maxModelCalls
            : MAX_CONTINUATION_MODEL_CALLS,
        },
      );
    } else {
      await continueUntilTerminal(
        agent,
        resumeWorkspaceStore,
        compiler,
        {
          ...(unlimited ? UNLIMITED_CONTINUATION_BUDGET : {}),
          maxMs: continuationMaxMs,
          startedAtMs,
          maxModelCalls: unlimited
            ? UNLIMITED_CONTINUATION_BUDGET.maxModelCalls
            : MAX_CONTINUATION_MODEL_CALLS,
        },
        {
          log: (line) => void stdout.write(`[续跑] ${line}\n`),
        },
      );
    }
    await dumpResumeIfRequested(cliArguments.dumpResume, resumeWorkspaceStore);
    return;
  }

  stdout.write(
    `Coolto 本地 Pi Agent 已启动（${config.modelId}）。输入自然语言，Ctrl+D 退出。\n\n`,
  );

  const terminal = createInterface({ input: stdin, output: stdout });

  const onInterrupt = (): void => {
    if (agent.isRunning) {
      agent.cancel();
      return;
    }
    terminal.close();
  };
  process.on("SIGINT", onInterrupt);

  try {
    while (true) {
      let input: string;
      try {
        input = await terminal.question("你> ");
      } catch {
        break;
      }

      if (input.trim()) {
        stdout.write("Agent> ");
        await agent.prompt(input);
        await resolvePendingApprovals(agent, terminal);
      }
    }
  } finally {
    process.off("SIGINT", onInterrupt);
    terminal.close();
  }
}

const AUTO_APPROVE_LOG = "local-output/approvals.log";
/** Initial one-shot turn cap: overrunning is soft-cancelled, not fatal. */
const INITIAL_PROMPT_MAX_MS = 210_000;

/** Continuation cap aligned with the desktop DEFAULT_CONTINUATION_BUDGET philosophy. */
const MAX_CONTINUATION_MODEL_CALLS = 40;

/** Generation budget gate: ≤ 5 minutes end to end (testing target only). */
const DEFAULT_MAX_MINUTES = 5;

/**
 * One-shot auto-approve driver. Approvals may be created mid-generation
 * (profile update before the source snapshot, resume save, PDF export), so
 * acceptance and workspace continuation must interleave: accept the pending
 * approval, give the agent one turn to react, then drive the workspace with
 * the continuation budget until a terminal state or a new approval appears.
 */
async function autoApproveUntilTerminal(
  agent: ReturnType<typeof createCooltoAgent>,
  store: ResumeWorkspaceStore,
  compiler: ResumeCompiler,
  budget: { maxMs: number; startedAtMs: number; maxModelCalls: number },
): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const request = agent.getPendingApprovals()[0];
    if (request) {
      stdout.write(`\n[自动接受审批] ${request.title}\n`);
      stdout.write(`${request.description}\n`);
      for (const field of request.preview.summary) {
        stdout.write(`- ${field.label}：${field.value}\n`);
      }
      for (const field of request.preview.profileFields ?? []) {
        stdout.write(
          `- ${field.label}：${field.currentValue ?? "（未填写）"} → ${field.proposedValue}\n`,
        );
      }
      const logLine = JSON.stringify({
        at: new Date().toISOString(),
        actionType: request.actionType,
        risk: request.risk,
        title: request.title,
        description: request.description,
        summary: request.preview.summary,
      });
      await appendFile(AUTO_APPROVE_LOG, `${logLine}\n`).catch(() => undefined);
      await agent.resolveApproval(request.id, { type: "accept" });
      stdout.write("Agent> ");
      await agent.prompt("请继续完成你的任务，无需等待确认。");
      continue;
    }
    await continueUntilTerminal(
      agent,
      store,
      compiler,
      {
        maxMs: budget.maxMs,
        startedAtMs: budget.startedAtMs,
        maxModelCalls: budget.maxModelCalls,
      },
      {
        log: (line) => void stdout.write(`[续跑] ${line}\n`),
      },
    );
    if (agent.getPendingApprovals().length === 0) return;
  }
  stdout.write("\n[auto-approve] 达到轮次上限，已停止。\n");
}

async function dumpResumeIfRequested(
  dumpResume: string | undefined,
  store: ResumeWorkspaceStore,
): Promise<void> {
  if (!dumpResume) return;
  const workspace = store.latest();
  if (!workspace) {
    stdout.write("本次会话没有生成简历草稿（workspace 为空）。\n");
    return;
  }
  const payload = {
    status: workspace.status,
    revision: workspace.revision,
    usageRatio: workspace.compileResult.usageRatio,
    structure: workspace.structure,
  };
  await writeFile(dumpResume, JSON.stringify(payload, null, 2));
  stdout.write(
    `\n简历草稿已导出：${dumpResume}（status=${workspace.status}，usageRatio=${workspace.compileResult.usageRatio.toFixed(3)}）\n`,
  );
  stdout.write(
    `导出 PDF：npm run pdf:export -- --structure ${dumpResume} --out local-output/resume.pdf\n`,
  );
}
