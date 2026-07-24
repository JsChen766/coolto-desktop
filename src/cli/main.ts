#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { createActionApprovalManager } from "../actions/create-action-approvals.js";
import { createCooltoAgent } from "../agent/create-agent.js";
import { CooltoApiClient } from "../api/coolto-api-client.js";
import { KeychainSessionStore } from "../auth/keychain-session-store.js";
import { ensureAuthenticated } from "../auth/session-manager.js";
import { loadLocalEnv, readConfig } from "../config.js";
import { SelectedFileRegistry } from "../files/selected-file-registry.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";
import { JdProposalStore } from "../jd/proposal-store.js";
import { ResumeSourceSnapshotBuilder } from "../resume/source-snapshot.js";
import { createToolRegistry } from "../tools/registry.js";
import {
  resolvePendingApprovals,
} from "./approval-ui.js";
import { parseCliArguments } from "./args.js";
import { readLoginCredentials } from "./login.js";
import { renderEvent } from "./render-event.js";

async function main(): Promise<void> {
  loadLocalEnv();
  const config = readConfig();
  const cliArguments = parseCliArguments(process.argv.slice(2));
  const apiClient = new CooltoApiClient({
    baseUrl: config.apiBaseUrl,
  });
  const sessionStore = new KeychainSessionStore({
    apiBaseUrl: config.apiBaseUrl,
  });
  const authenticated = await ensureAuthenticated(
    apiClient,
    sessionStore,
    config.apiBaseUrl,
    readLoginCredentials,
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
  const approvalManager = createActionApprovalManager({
    experienceWriter: apiClient,
    importProposalStore,
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
  const agent = createCooltoAgent({
    apiKey: config.apiKey,
    modelId: config.modelId,
    approvalManager,
    tools: createToolRegistry({
      currentUserReader: apiClient,
      userProfileReader: apiClient,
      experienceReader: apiClient,
      jdReader: apiClient,
      resumeReader: apiClient.resumes,
      resumeSourceSnapshotBuilder,
      importProposalStore,
      jdProposalStore,
      approvalManager,
      selectedFileRegistry: selectedFiles,
    }),
  });

  agent.subscribe((event) => {
    renderEvent(event);
  });

  const oneShotInput = cliArguments.prompt;
  if (oneShotInput) {
    await agent.prompt(oneShotInput);
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`启动失败：${message}\n`);
  process.exitCode = 1;
});
