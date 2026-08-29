import { app, BrowserWindow, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";

import { isBrowserSitePolicyAllowed } from "../browser/site-policy-registry.js";
import type { BrowserAgentController } from "../browser/agent-control-types.js";
import type { BrowserPageOperator, FormElementSummary } from "../browser/types.js";
import { registerBrowserIpc } from "../desktop/main/browser/browser-ipc.js";
import { until } from "./browser-agent-qa-wait.js";
import {
  runBrowserWebmailQa,
  type BrowserWebmailQaCapture,
} from "./browser-webmail-qa.js";

interface LiveConfig {
  provider: "outlook" | "163";
  startUrl: string;
  origin: string;
  domain: string;
  timeoutMs: number;
  subject?: string;
  bodyMarker?: string;
  capture?: BrowserWebmailQaCapture;
}

const reportPath = process.env.COOLTO_WEBMAIL_LIVE_QA_REPORT;
const keepAlive = setInterval(() => {}, 1_000);

app.whenReady().then(async () => {
  const config = readConfig();
  process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS = config.origin;
  const main = new BrowserWindow({ show: false });
  const manager = registerBrowserIpc(ipcMain, main);
  const browser = manager.agentController;
  const operator = manager.pageOperator;
  try {
    manager.open({ url: config.startUrl });
    await showQaBrowserWindow(main);
    await until(() => browser.listTabs().length === 1, 30_000);
    if (!config.subject || !config.bodyMarker) {
      await waitForMailboxOrigin(
        () => browser.getActiveTab(), config.origin, config.timeoutMs,
      );
      await writeReport({
        provider: config.provider, origin: config.origin,
        stage: "login", passed: true,
        electronVersion: process.versions.electron,
      });
      await until(() => browser.listTabs().length === 0, 30 * 60_000);
      return;
    }
    const subject = config.subject;
    const bodyMarker = config.bodyMarker;
    const located = await waitForTestSubject(
      browser, operator, config.origin, subject,
      `BE5 ${config.provider} live acceptance`, config.timeoutMs,
    );
    const target = located.target;
    await operator.clickElement(target.fillId);
    await browser.waitFor({
      kind: "text", value: bodyMarker, timeoutMs: 30_000,
    });
    const timeElements = await browser.queryElements({
      selector: "time,[datetime]", limit: 20,
    });
    const result = config.capture ? await runBrowserWebmailQa({
      browser, allowedDomain: config.domain, capture: config.capture,
      sitePolicyAllows: isBrowserSitePolicyAllowed,
    }) : undefined;
    await writeReport({
      provider: config.provider, origin: config.origin,
      stage: result ? "capture" : "probe",
      dedupeCount: result?.dedupeCount ?? null,
      bodyVerified: result?.bodyVerified ?? null,
      passed: result ? result.dedupeCount === 1 && result.bodyVerified : true,
      timeCandidates: timeElements.elements.map((item) =>
        item.text || item.label).filter(Boolean),
      taggedElementCount: located.taggedCount,
      electronVersion: process.versions.electron,
    });
  } catch (error) {
    await writeReport({
      provider: config.provider,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    app.exit(1);
    return;
  } finally {
    manager.dispose();
    if (!main.isDestroyed()) main.destroy();
    clearInterval(keepAlive);
  }
  app.quit();
}).catch(async (error: unknown) => {
  await writeReport({ passed: false, error: String(error) }).catch(() => {});
  clearInterval(keepAlive);
  app.exit(1);
});

function readConfig(): LiveConfig {
  const provider = process.env.COOLTO_WEBMAIL_LIVE_QA_PROVIDER;
  if (provider !== "outlook" && provider !== "163") {
    throw new Error("COOLTO_WEBMAIL_LIVE_QA_PROVIDER 必须是 outlook 或 163");
  }
  const subject = process.env.COOLTO_WEBMAIL_LIVE_QA_SUBJECT?.trim();
  const bodyMarker = process.env.COOLTO_WEBMAIL_LIVE_QA_BODY_MARKER?.trim();
  if (Boolean(subject) !== Boolean(bodyMarker)) {
    throw new Error("probe/capture 模式必须同时配置 subject 与 body marker");
  }
  const capture = subject && bodyMarker
    ? optionalCapture(subject, bodyMarker) : undefined;
  const timeoutMs = readTimeout();
  const testMail = subject && bodyMarker ? { subject, bodyMarker } : {};
  return provider === "outlook"
    ? {
        provider, startUrl: "https://outlook.live.com/mail/0/",
        origin: "https://outlook.live.com", domain: "outlook.live.com",
        timeoutMs, ...testMail, ...(capture ? { capture } : {}),
      }
    : {
        provider, startUrl: "https://mail.163.com/",
        origin: "https://mail.163.com", domain: "mail.163.com",
        timeoutMs, ...testMail, ...(capture ? { capture } : {}),
      };
}

function optionalCapture(
  subject: string,
  bodyText: string,
): BrowserWebmailQaCapture | undefined {
  const sender = process.env.COOLTO_WEBMAIL_LIVE_QA_SENDER?.trim();
  const receivedAt = process.env.COOLTO_WEBMAIL_LIVE_QA_RECEIVED_AT?.trim();
  const receivedAtEvidence = process.env.COOLTO_WEBMAIL_LIVE_QA_TIME_EVIDENCE?.trim();
  if (!sender && !receivedAt && !receivedAtEvidence) return undefined;
  if (!sender || !receivedAt || !receivedAtEvidence) {
    throw new Error("capture 模式必须同时配置 sender、receivedAt 与 time evidence");
  }
  return { sender, subject, receivedAt, receivedAtEvidence, bodyText };
}

async function waitForMailboxOrigin(
  active: () => { id: string; url: string | null } | null,
  expectedOrigin: string,
  timeoutMs: number,
): Promise<void> {
  let stableTabId = "";
  let stableSince = 0;
  await until(() => {
    const tab = active();
    try {
      if (!tab?.url || new URL(tab.url).origin !== expectedOrigin) {
        stableTabId = ""; stableSince = 0; return false;
      }
      if (stableTabId !== tab.id) {
        stableTabId = tab.id; stableSince = Date.now(); return false;
      }
      return Date.now() - stableSince >= 1_000;
    }
    catch { return false; }
  }, timeoutMs);
}

async function waitForTestSubject(
  browser: BrowserAgentController,
  operator: BrowserPageOperator,
  expectedOrigin: string,
  subject: string,
  grantReason: string,
  timeoutMs: number,
): Promise<{ target: FormElementSummary; taggedCount: number }> {
  const startedAt = Date.now();
  let attempts = 0;
  let bestScore = 0;
  const bestRoles = new Set<string>();
  while (Date.now() - startedAt < timeoutMs) {
    const url = browser.getActiveTab()?.url;
    try {
      if (url && new URL(url).origin === expectedOrigin) {
        if (!operator.checkWriteAccess().ok) operator.grantWriteAccess(grantReason);
        const tagged = await operator.tagElements(subject);
        attempts += 1;
        for (const item of tagged) {
          const score = subjectMatchCount(`${item.label}\n${item.text ?? ""}`, subject);
          if (score > bestScore) { bestScore = score; bestRoles.clear(); }
          if (score === bestScore && score > 0) bestRoles.add(item.role ?? item.elementType);
        }
        const target = tagged.find((item) =>
          matchesSubject(`${item.label}\n${item.text ?? ""}`, subject));
        if (target) return { target, taggedCount: tagged.length };
      }
    } catch {
      // Outlook 登录重定向或页面重建期间继续等待稳定邮箱页面。
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `等待测试邮件超时：tokenMatch=${bestScore}/${subjectTokens(subject).length};` +
    `roles=${[...bestRoles].join(",") || "none"};attempts=${attempts}`,
  );
}

function matchesSubject(value: string, subject: string): boolean {
  const tokens = subjectTokens(subject);
  return tokens.length > 0 && subjectMatchCount(value, subject) === tokens.length;
}

function subjectMatchCount(value: string, subject: string): number {
  const candidate = value.toLowerCase();
  return subjectTokens(subject).filter((token) => candidate.includes(token)).length;
}

function subjectTokens(subject: string): string[] {
  return [...new Set(subject.toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((item) => item.length >= 2))];
}

function readTimeout(): number {
  const value = Number(process.env.COOLTO_WEBMAIL_LIVE_QA_TIMEOUT_MS ?? 600_000);
  if (!Number.isFinite(value) || value < 10_000 || value > 600_000) {
    throw new Error("COOLTO_WEBMAIL_LIVE_QA_TIMEOUT_MS 必须是 10000–600000 毫秒");
  }
  return value;
}

function writeReport(value: unknown): Promise<void> {
  return reportPath
    ? writeFile(reportPath, JSON.stringify(value, null, 2), "utf8")
    : Promise.resolve();
}

async function showQaBrowserWindow(main: BrowserWindow): Promise<void> {
  await until(() => BrowserWindow.getAllWindows().some((window) => window !== main));
  const browserWindow = BrowserWindow.getAllWindows()
    .find((window) => window !== main);
  if (!browserWindow) throw new Error("QA 浏览器窗口未创建");
  browserWindow.show();
  browserWindow.focus();
}
