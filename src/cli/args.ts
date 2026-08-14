import { readFile } from "node:fs/promises";

export interface CliArguments {
  prompt: string;
  attachmentPaths: string[];
  /** Write the final resume workspace structure to this JSON path when set. */
  dumpResume?: string;
  /** Auto-accept pending approvals in one-shot mode (CLI testing only). */
  autoApprove?: boolean;
  /** One-shot generation budget in minutes (default 5). */
  maxMinutes?: number;
  /** Production mode: never hard-stop the run for wall-clock time; the 5
   * minute target only applies when maxMinutes is set. */
  noTimeout?: boolean;
  /** Restore the login session from this JSON file instead of the OS
   * keychain (useful when the electron process cannot read the keychain). */
  sessionFile?: string;
}

export async function parseCliArguments(args: string[]): Promise<CliArguments> {
  const attachmentPaths: string[] = [];
  const promptParts: string[] = [];
  let dumpResume: string | undefined;
  let autoApprove = false;
  let maxMinutes: number | undefined;
  let noTimeout = false;
  let sessionFile: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (value === "--auto-approve") {
      autoApprove = true;
      continue;
    }
    if (value === "--no-timeout") {
      noTimeout = true;
      continue;
    }
    if (value === "--max-minutes") {
      const raw = args[index + 1];
      const parsed = Number.parseInt(raw ?? "", 10);
      if (!raw || !Number.isInteger(parsed) || parsed < 1) {
        throw new Error("--max-minutes 后必须提供 ≥1 的整数分钟数");
      }
      maxMinutes = parsed;
      index += 1;
      continue;
    }
    if (value.startsWith("--max-minutes=")) {
      const raw = value.slice("--max-minutes=".length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("--max-minutes 后必须提供 ≥1 的整数分钟数");
      }
      maxMinutes = parsed;
      continue;
    }
    if (value === "--attach") {
      const path = args[index + 1];
      if (!path) {
        throw new Error("--attach 后必须提供文件路径");
      }
      attachmentPaths.push(path);
      index += 1;
      continue;
    }
    if (value.startsWith("--attach=")) {
      const path = value.slice("--attach=".length);
      if (!path) {
        throw new Error("--attach 后必须提供文件路径");
      }
      attachmentPaths.push(path);
      continue;
    }
    if (value === "--dump-resume") {
      const path = args[index + 1];
      if (!path) {
        throw new Error("--dump-resume 后必须提供输出文件路径");
      }
      dumpResume = path;
      index += 1;
      continue;
    }
    if (value.startsWith("--dump-resume=")) {
      const path = value.slice("--dump-resume=".length);
      if (!path) {
        throw new Error("--dump-resume 后必须提供输出文件路径");
      }
      dumpResume = path;
      continue;
    }
    if (value === "--prompt-file") {
      const path = args[index + 1];
      if (!path) {
        throw new Error("--prompt-file 后必须提供文件路径");
      }
      promptParts.push(await readFile(path, "utf8"));
      index += 1;
      continue;
    }
    if (value === "--session-file") {
      const path = args[index + 1];
      if (!path) {
        throw new Error("--session-file 后必须提供文件路径");
      }
      sessionFile = path;
      index += 1;
      continue;
    }
    if (value.startsWith("--prompt-file=")) {
      const path = value.slice("--prompt-file=".length);
      if (!path) {
        throw new Error("--prompt-file 后必须提供文件路径");
      }
      promptParts.push(await readFile(path, "utf8"));
      continue;
    }
    if (value.startsWith("--")) {
      throw new Error(`未知 CLI 参数：${value}`);
    }
    promptParts.push(value);
  }

  return {
    prompt: promptParts.join(" ").trim(),
    attachmentPaths,
    ...(dumpResume ? { dumpResume } : {}),
    ...(autoApprove ? { autoApprove } : {}),
    ...(maxMinutes ? { maxMinutes } : {}),
    ...(noTimeout ? { noTimeout } : {}),
    ...(sessionFile ? { sessionFile } : {}),
  };
}

