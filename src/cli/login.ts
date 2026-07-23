import { stdout, stdin } from "node:process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import type { LoginCredentials } from "../api/types.js";

class MaskableOutput extends Writable {
  public muted = false;

  public override _write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) {
      stdout.write(chunk, encoding);
    }
    callback();
  }
}

/**
 * Credentials are returned to the caller and never persisted by this module.
 * Environment credentials exist only to support non-interactive integration
 * tests; normal users are prompted with a masked password.
 */
export async function readLoginCredentials(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LoginCredentials> {
  const envEmail = env.COOLTO_EMAIL?.trim();
  const envPassword = env.COOLTO_PASSWORD;

  if (envEmail || envPassword) {
    if (!envEmail || !envPassword) {
      throw new Error(
        "非交互登录必须同时提供 COOLTO_EMAIL 和 COOLTO_PASSWORD",
      );
    }
    return { email: envEmail, password: envPassword };
  }

  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      "当前终端无法安全读取登录信息。请在交互终端运行，或为本次进程同时设置 COOLTO_EMAIL 和 COOLTO_PASSWORD。",
    );
  }

  const maskedOutput = new MaskableOutput();
  const terminal = createInterface({
    input: stdin,
    output: maskedOutput,
    terminal: true,
  });

  try {
    const email = (await terminal.question("Coolto 邮箱：")).trim();

    stdout.write("Coolto 密码：");
    maskedOutput.muted = true;
    const password = await terminal.question("");
    maskedOutput.muted = false;
    stdout.write("\n");

    if (!email || !password) {
      throw new Error("邮箱和密码不能为空");
    }

    return { email, password };
  } finally {
    maskedOutput.muted = false;
    terminal.close();
  }
}
