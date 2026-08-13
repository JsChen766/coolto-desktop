import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import type { CooltoApiClient } from "../api/coolto-api-client.js";
import type { DeviceInput } from "../api/types.js";

export function buildDevice(deviceIdOverride?: string): DeviceInput {
  const p = process.platform;
  return {
    id: deviceIdOverride ?? randomUUID(),
    name: hostname(),
    platform: p === "win32" ? "windows" : p === "darwin" ? "macos" : "linux",
    appVersion: "0.1.0",
  };
}

export async function performEmailOtpLogin(
  apiClient: CooltoApiClient,
  deviceIdOverride?: string,
): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      "当前终端无法安全读取登录信息。请在交互终端运行。",
    );
  }

  const terminal = createInterface({
    input: stdin,
    output: stdout,
    terminal: true,
  });

  try {
    const email = (await terminal.question("Coolto 邮箱：")).trim();
    if (!email) throw new Error("邮箱不能为空");

    const device = buildDevice(deviceIdOverride);
    const challengeId = randomUUID();

    stdout.write("正在发送验证码...\n");
    const challenge = await apiClient.requestEmailChallenge({
      challengeId,
      email,
      purpose: "login",
      device,
    });

    const expiresIn = Math.round(
      (new Date(challenge.expiresAt).getTime() - Date.now()) / 1000,
    );
    stdout.write(`验证码已发送至 ${email}，${expiresIn} 秒内有效。\n`);

    const code = (await terminal.question("请输入验证码：")).trim();
    if (!code) throw new Error("验证码不能为空");

    await apiClient.verifyEmailChallenge({ challengeId, code, device });
  } finally {
    terminal.close();
  }
}
