#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { createCooltoAgent } from "../agent/create-agent.js";
import type { CooltoAgentEvent } from "../agent/events.js";
import { CooltoApiClient } from "../api/coolto-api-client.js";
import { KeychainSessionStore } from "../auth/keychain-session-store.js";
import { ensureAuthenticated } from "../auth/session-manager.js";
import { loadLocalEnv, readConfig } from "../config.js";
import { createToolRegistry } from "../tools/registry.js";
import { readLoginCredentials } from "./login.js";

function renderEvent(event: CooltoAgentEvent): void {
  switch (event.type) {
    case "message.delta":
      stdout.write(event.text);
      break;

    case "tool.started":
      stdout.write(`\n[工具] ${event.name}\n`);
      break;

    case "tool.completed":
      if (event.isError) {
        stdout.write(`[工具失败] ${event.name}\n`);
      }
      break;

    case "run.failed":
      stdout.write(`\n[失败] ${event.message}\n`);
      break;

    case "run.completed":
      stdout.write("\n");
      break;

    default:
      break;
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const config = readConfig();
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

  const agent = createCooltoAgent({
    apiKey: config.apiKey,
    modelId: config.modelId,
    tools: createToolRegistry({
      currentUserReader: apiClient,
      experienceReader: apiClient,
    }),
  });

  agent.subscribe((event) => {
    renderEvent(event);
  });

  const oneShotInput = process.argv.slice(2).join(" ").trim();
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
