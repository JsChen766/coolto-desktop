import { app, BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

interface Result { name: string; passed: boolean }
const results: Result[] = [];
const keepAlive = setInterval(() => {}, 1_000);
const expect = (name: string, passed: boolean): void => {
  results.push({ name, passed });
  if (!passed) throw new Error(`QA failed: ${name}`);
};

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: Boolean(process.env.COOLTO_AGENT_TASKS_UI_QA_SCREENSHOT), width: 1200, height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await window.loadFile(join(__dirname, "../renderer/agent-tasks-qa.html"));
    await window.webContents.setZoomFactor(1);
    window.setContentSize(1200, 800);
    await waitFor(window, ".agent-tasks-view");
    await waitFor(window, ".mail-connection-row");
    await waitFor(window, ".loop-dialog");
    const approval = await text(window);
    expect("00d Resume Loop dialog freezes the selected asset and final confirmation",
      approval.includes("用此简历自动找岗") && approval.includes("Backend Resume") &&
      approval.includes("每个岗位提交前单独确认"));
    const screenshotPath = process.env.COOLTO_AGENT_TASKS_UI_QA_SCREENSHOT;
    if (screenshotPath) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await writeFile(screenshotVariant(screenshotPath, "resume"),
        (await window.webContents.capturePage()).toPNG());
    }
    expect("00 Answer Vault approval renders immutable facts",
      approval.includes("保存到 Answer Vault") &&
      approval.includes("Are you authorized to work in Canada?") &&
      approval.includes("jobs.example"));
    expect("00c resume mismatch renders a normal two-action strategy card",
      approval.includes("这份岗位暂时无法生成可信的针对性简历") &&
      approval.includes("使用通用简历") && approval.includes("不继续投递"));
    expect("00a Tracker renders linked SubmissionReceipt",
      approval.includes("投递证据") && approval.includes("已确认提交") &&
      approval.includes("bbbbbbbbbbbb"));
    expect("00b provider-neutral mail settings show read-only consent",
      approval.includes("qa@example.com") && approval.includes("gmail.readonly") &&
      approval.includes("发送权限始终为关闭"));
    await window.webContents.executeJavaScript(
      "document.querySelector('#resume-loop-qa')?.remove()", true,
    );
    await clickText(window, "联动 App 日程");
    await waitFor(window, ".loop-dialog");
    expect("00e Mail Loop dialog exposes source, direction and interval",
      (await text(window)).includes("识别方向") && (await text(window)).includes("检查间隔"));
    if (screenshotPath) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await writeFile(screenshotVariant(screenshotPath, "mail"),
        (await window.webContents.capturePage()).toPNG());
      await captureFeatureSet(window, screenshotPath);
    }
    await window.webContents.executeJavaScript(
      "document.querySelector('#approval-qa')?.remove(); document.querySelector('#resume-strategy-qa')?.remove(); document.querySelector('#receipt-qa')?.remove(); document.querySelector('#mail-settings-qa')?.remove(); window.scrollTo(0, 0)", true,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    const wide = await inspect(window);
    expect("01 wide task list visible", wide.taskRows === 1 && wide.listVisible);
    expect("02 inspector shows local runtime", wide.text.includes("仅在 App 打开时运行"));
    expect("02a shortlist lead renders", wide.text.includes("Backend Engineer") && wide.text.includes("86"));
    expect("02b Loop summary uses product labels without hashes",
      wide.text.includes("自动找岗 Loop") && wide.text.includes("Backend Resume") &&
      !wide.text.includes("resumeContentHash"));
    if (screenshotPath) await writeFile(
      screenshotVariant(screenshotPath, "task-center"),
      (await window.webContents.capturePage()).toPNG(),
    );
    await clickText(window, "动态");
    expect("03 activity source loads", (await text(window)).includes("grant_allowed"));
    await clickText(window, "回执");
    expect("04 receipt section renders", (await text(window)).includes("browser_navigate"));
    await clickText(window, "授权");
    expect("05 grant domains render", (await text(window)).includes("jobs.example"));
    await clickText(window, "概览");
    await clickText(window, "暂停");
    await waitText(window, "已暂停");
    expect("06 pause action updates truthful state", (await text(window)).includes("已暂停"));

    await window.webContents.executeJavaScript(
      "document.documentElement.classList.add('dark')",
      true,
    );
    const dark = await window.webContents.executeJavaScript(
      "getComputedStyle(document.documentElement).colorScheme",
      true,
    );
    expect("07 dark theme tokens apply", dark === "dark");

    window.setContentSize(640, 720);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await window.webContents.executeJavaScript(
      "document.querySelector('.mobile-back')?.click()",
      true,
    );
    const narrow = await inspect(window);
    expect("08 narrow view restores task list", narrow.listVisible);
    await window.webContents.executeJavaScript(
      "document.querySelector('.task-row')?.focus()",
      true,
    );
    const focused = await window.webContents.executeJavaScript(
      "document.activeElement?.classList.contains('task-row')",
      true,
    );
    expect("09 task rows are keyboard focusable", Boolean(focused));
    await window.webContents.setZoomFactor(2);
    const overflow = await window.webContents.executeJavaScript(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      true,
    );
    expect("10 200 percent zoom has no page overflow", Boolean(overflow));
    const screenshot = (await window.webContents.capturePage()).toPNG();
    expect("11 rendered screenshot is non-empty", screenshot.byteLength > 1000);
    if (screenshotPath) await writeFile(screenshotPath, screenshot);
    await report({ passed: results.length, runtime: {
      electron: process.versions.electron, platform: process.platform,
    }, results });
  } catch (error) {
    await report({ passed: results.length, results,
      error: error instanceof Error ? error.stack : String(error) }).catch(() => {});
    throw error;
  } finally {
    if (!window.isDestroyed()) window.destroy();
    clearInterval(keepAlive);
    app.quit();
  }
}).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  clearInterval(keepAlive);
  app.exit(1);
});

async function inspect(window: BrowserWindow) {
  return window.webContents.executeJavaScript(`(() => ({
    text: document.body.innerText,
    taskRows: document.querySelectorAll('.task-row').length,
    listVisible: !!document.querySelector('.tasks-list-pane') &&
      getComputedStyle(document.querySelector('.tasks-list-pane')).display !== 'none'
  }))()`, true) as Promise<{ text: string; taskRows: number; listVisible: boolean }>;
}

function text(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript("document.body.innerText", true);
}

async function clickText(window: BrowserWindow, value: string): Promise<void> {
  await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent?.trim() === ${JSON.stringify(value)});
    if (!button) throw new Error('button not found'); button.click();
  })()`, true);
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function waitFor(window: BrowserWindow, selector: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    if (await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`, true)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`selector timeout: ${selector}`);
}

async function waitText(window: BrowserWindow, value: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    if ((await text(window)).includes(value)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`text timeout: ${value}`);
}

function report(value: unknown): Promise<void> {
  const path = process.env.COOLTO_AGENT_TASKS_UI_QA_REPORT;
  return path ? writeFile(path, JSON.stringify(value, null, 2), "utf8") : Promise.resolve();
}

function screenshotVariant(path: string, suffix: string): string {
  return path.replace(/\.png$/iu, `-${suffix}.png`);
}

async function captureFeatureSet(window: BrowserWindow, path: string): Promise<void> {
  await window.webContents.executeJavaScript(
    "document.querySelector('.loop-dialog-backdrop')?.remove()", true,
  );
  await captureElement(window, "#approval-qa", screenshotVariant(path, "answer-vault"));
  await captureElement(window, "#receipt-qa", screenshotVariant(path, "application"));
  await captureElement(window, "#mail-settings-qa", screenshotVariant(path, "mail-settings"));
  for (const [id, suffix] of [
    ["follow-up-loop-qa", "follow-up"], ["briefing-loop-qa", "briefing"],
    ["strategy-loop-qa", "strategy"], ["risk-loop-qa", "risk"],
  ] as const) {
    await window.webContents.executeJavaScript(
      `document.getElementById(${JSON.stringify(id)})?.style.setProperty('display', 'block')`, true,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    await writeFile(screenshotVariant(path, suffix),
      (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(
      `document.getElementById(${JSON.stringify(id)})?.remove()`, true,
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

async function captureElement(
  window: BrowserWindow, selector: string, path: string,
): Promise<void> {
  const rect = await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) throw new Error('fixture not found');
    element.scrollIntoView({ block: 'center' });
    const value = element.getBoundingClientRect();
    return { x: Math.max(0, Math.floor(value.x)), y: Math.max(0, Math.floor(value.y)),
      width: Math.ceil(value.width), height: Math.ceil(value.height) };
  })()`, true) as Electron.Rectangle;
  await new Promise((resolve) => setTimeout(resolve, 100));
  await writeFile(path, (await window.webContents.capturePage(rect)).toPNG());
}
