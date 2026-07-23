#!/usr/bin/env node

import { CooltoApiClient } from "../api/coolto-api-client.js";
import { KeychainSessionStore } from "../auth/keychain-session-store.js";
import {
  loadLocalEnv,
  readApiBaseUrl,
} from "../config.js";

async function main(): Promise<void> {
  loadLocalEnv();
  const apiBaseUrl = readApiBaseUrl();
  const sessionStore = new KeychainSessionStore({ apiBaseUrl });
  const storedSession = await sessionStore.load();

  if (!storedSession) {
    process.stdout.write("当前没有已保存的 Coolto 登录 Session。\n");
    return;
  }

  const apiClient = new CooltoApiClient({ baseUrl: apiBaseUrl });
  apiClient.restoreSession(storedSession.accessToken);

  let backendRevoked = false;
  try {
    await apiClient.logout();
    backendRevoked = true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `后端 Session 撤销失败，本地凭据仍会清除：${message}\n`,
    );
  } finally {
    await sessionStore.clear();
  }

  process.stdout.write(
    backendRevoked
      ? "已退出 Coolto，并清除系统安全凭据库中的 Session。\n"
      : "已清除本地 Coolto Session；服务端 Session 将在过期后失效。\n",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`退出失败：${message}\n`);
  process.exitCode = 1;
});
