import { app, BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  bodyText,
  clickNav,
  clickText,
  openDialogSelect,
  waitFor,
  waitText,
} from "./profile-pref-ui-qa-helpers.js";

interface Result { name: string; passed: boolean }
const results: Result[] = [];
const keepAlive = setInterval(() => {}, 1_000);
const expect = (name: string, passed: boolean): void => {
  results.push({ name, passed });
  if (!passed) throw new Error(`QA failed: ${name}`);
};

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false, width: 1280, height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.on("console-message", (_event, _level, message) => {
    process.stderr.write(`[renderer] ${message}\n`);
  });
  try {
    await window.loadFile(join(__dirname, "../renderer/profile-pref-qa.html"));
    await waitFor(window, "[data-settings-shell]");
    expect("[C1] settings shell renders", (await bodyText(window)).includes("设置"));

    await clickText(window, "编辑个人信息");
    await waitFor(window, ".profile-dialog");
    expect("[C1] profile opens over settings", Boolean(await window.webContents.executeJavaScript(
      "Boolean(document.querySelector('[data-settings-shell]') && document.querySelector('.profile-dialog'))", true,
    )));

    await waitText(window, "编辑");
    await clickIn(window, ".profile-dialog", "编辑");
    await waitFor(window, ".profile-dialog .dialog-select-trigger");
    const stageLabel = await openDialogSelect(window, ".profile-dialog");
    expect("[A1-ui] profile DialogSelect opens themed menu", stageLabel.length > 0);
    await setInputValue(window, '.profile-dialog input[data-profile-field="fullName"]', "自动化验收名");
    await clickIn(window, ".profile-dialog", "保存");
    await waitText(window, "确认个人档案修改");
    await clickText(window, "确认并保存");
    await waitText(window, "自动化验收名");

    const storedName = await readStoredProfileField(window, "fullName");
    expect("[A4] profile save persists to QA session store", storedName === "自动化验收名");

    await clickText(window, "关闭");
    await clickNav(window, "preferences");
    await clickText(window, "管理偏好");
    await waitFor(window, ".preference-dialog");
    const margin = await window.webContents.executeJavaScript(`(() => {
      const actions = document.querySelector('.preference-dialog > .dialog-actions');
      if (!actions) return 0;
      return Number.parseFloat(getComputedStyle(actions).marginRight || '0');
    })()`, true) as number;
    expect("[A2-ui] preference list footer has side margin", margin >= 18);

    await clickText(window, "新增偏好");
    await waitFor(window, ".preference-form .dialog-select-trigger");
    await openDialogSelect(window, ".preference-form");
    await setInputValue(window, ".preference-form input[placeholder]", "qa-pref-value");
    await clickText(window, "查看变更并确认");
    await waitText(window, "确认偏好变更");
    await clickText(window, "确认并保存");
    await waitText(window, "qa-pref-value");

    const prefCount = await readStoredPreferenceCount(window);
    expect("[A2] preference create persists in QA store", prefCount >= 1);

    await clickText(window, "关闭");
    await clickNav(window, "preferences");
    await clickText(window, "管理偏好");
    await waitText(window, "行为建议");
    expect("[A5] seeded behavior suggestion renders", (await bodyText(window)).includes("简历语气") || (await bodyText(window)).includes("行为建议"));
    await clickText(window, "关闭");

    await window.webContents.reload();
    await waitFor(window, "[data-settings-shell]");
    expect("[A4] session survives reload", (await readStoredProfileField(window, "fullName")) === "自动化验收名");

    await waitFor(window, "#approval-pref-qa .approval-card");
    expect("[A3] preference approval card renders", (await bodyText(window)).includes("确认偏好变更"));
    await clickIn(window, "#approval-pref-qa", "接受并执行");

    await waitFor(window, "#approval-inbox-app-qa .approval-card");
    const inboxAppText = await regionText(window, "#approval-inbox-app-qa");
    expect("[C2-A3] inbox application approval shows tracker summary",
      inboxAppText.includes("确认邮件信号并更新投递进度") &&
      inboxAppText.includes("示例科技"));
    await waitFor(window, "#approval-inbox-interview-qa .approval-card");
    const inboxInterviewText = await regionText(window, "#approval-inbox-interview-qa");
    expect("[C2-A3] inbox interview approval shows schedule fields",
      inboxInterviewText.includes("确认邮件邀请并创建面试") &&
      inboxInterviewText.includes("Asia/Hong_Kong"));

    await waitFor(window, "#material-qa .material-library-view");
    expect("[B1] material library fixture mounts", (await bodyText(window)).includes("材料库"));

    const hasTrackerSelect = await window.webContents.executeJavaScript(
      'Boolean(document.querySelector("#application-qa .dialog-select-trigger"))', true,
    );
    expect("[C2] tracker application fields mount DialogSelect", Boolean(hasTrackerSelect));

    await report({ passed: results.length, results });
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

async function setInputValue(window: BrowserWindow, selector: string, value: string): Promise<void> {
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) throw new Error("input missing");
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`, true);
}

async function clickIn(window: BrowserWindow, root: string, label: string): Promise<void> {
  await window.webContents.executeJavaScript(`(() => {
    const rootEl = document.querySelector(${JSON.stringify(root)});
    if (!rootEl) throw new Error("root missing");
    const button = [...rootEl.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
    if (!button) throw new Error("button missing in root");
    button.click();
  })()`, true);
}

async function readStoredProfileField(window: BrowserWindow, field: string): Promise<string> {
  return window.webContents.executeJavaScript(`(() => {
    const raw = sessionStorage.getItem("coolto-phase2-ui-qa-v1");
    if (!raw) return "";
    const data = JSON.parse(raw);
    return String(data.profile?.${field} ?? "");
  })()`, true);
}

async function regionText(window: BrowserWindow, selector: string): Promise<string> {
  return window.webContents.executeJavaScript(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    return node instanceof HTMLElement ? node.innerText : "";
  })()`, true);
}

async function readStoredPreferenceCount(window: BrowserWindow): Promise<number> {
  return window.webContents.executeJavaScript(`(() => {
    const raw = sessionStorage.getItem("coolto-phase2-ui-qa-v1");
    if (!raw) return 0;
    return JSON.parse(raw).preferences?.length ?? 0;
  })()`, true);
}

function report(value: unknown): Promise<void> {
  const path = process.env.COOLTO_PROFILE_PREF_UI_QA_REPORT;
  return path ? writeFile(path, JSON.stringify(value, null, 2), "utf8") : Promise.resolve();
}
