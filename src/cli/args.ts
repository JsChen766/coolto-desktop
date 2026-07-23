export interface CliArguments {
  prompt: string;
  attachmentPaths: string[];
}

export function parseCliArguments(args: string[]): CliArguments {
  const attachmentPaths: string[] = [];
  const promptParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
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
    if (value.startsWith("--")) {
      throw new Error(`未知 CLI 参数：${value}`);
    }
    promptParts.push(value);
  }

  return {
    prompt: promptParts.join(" ").trim(),
    attachmentPaths,
  };
}
