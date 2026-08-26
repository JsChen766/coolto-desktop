export async function until(
  check: () => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("QA wait timed out");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function waitShell(
  manager: {
    shellWebContents(): {
      executeJavaScript(script: string, userGesture?: boolean): Promise<unknown>;
    } | undefined;
  },
  selector: string,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    if (await manager.shellWebContents()?.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`, true,
    )) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`shell selector timeout: ${selector}`);
}
