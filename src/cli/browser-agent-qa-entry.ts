import { app, BrowserWindow, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";

import { registerBrowserIpc } from "../desktop/main/browser/browser-ipc.js";
import { getBrowserSession } from "../desktop/main/browser/browser-session.js";
import { until, waitShell } from "./browser-agent-qa-wait.js";
import { runManagedApplyQa } from "./browser-managed-apply-qa.js";
import { runBrowserWebmailQa } from "./browser-webmail-qa.js";
import { frameHtml, pageOneHtml, pageTwoHtml } from "./browser-agent-qa-fixtures.js";

interface QaResult { name: string; passed: boolean; details?: unknown }

const results: QaResult[] = [];
const configuredReport = process.env.COOLTO_BROWSER_QA_REPORT;
if (configuredReport) {
  writeFileSync(configuredReport, JSON.stringify({
    started: true,
    electronAppType: typeof app,
    electronVersion: process.versions.electron ?? null,
  }), "utf8");
}
const keepAlive = setInterval(() => {}, 1_000);
const diagnostics = {
  fixtureDownloadRequests: 0,
  electronDownloadEvents: 0,
  downloadStates: [] as string[],
};
const expect = (name: string, passed: boolean, details?: unknown): void => {
  results.push({ name, passed, ...(details === undefined ? {} : { details }) });
  if (!passed) throw new Error(`QA failed: ${name}`);
};

let server: Server | undefined;

app.whenReady().then(async () => {
  getBrowserSession().on("will-download", (_event, item) => {
    diagnostics.electronDownloadEvents += 1;
    item.on("updated", (_updatedEvent, state) => {
      diagnostics.downloadStates.push(`updated:${state}`);
    });
    item.once("done", (_doneEvent, state) => {
      diagnostics.downloadStates.push(`done:${state}`);
    });
  });
  const fixture = await startFixtureServer();
  server = fixture.server;
  const main = new BrowserWindow({ show: false });
  const manager = registerBrowserIpc(ipcMain, main);
  const browser = manager.agentController;
  const operator = manager.pageOperator;
  const grant = (reason: string): void => operator.grantWriteAccess(reason);
  const agentCommands: string[] = [];
  manager.agentStatus.onCommand((command) => { agentCommands.push(command); });

  try {
    manager.open({ url: `${fixture.baseUrl}/page-1` });
    await until(() => browser.listTabs().length === 1);
    await browser.waitFor({ kind: "load" });
    manager.agentStatus.set({
      taskId: "task-qa", goal: "Find Agent roles", status: "running",
      control: "agent", message: "Agent is browsing", updatedAt: new Date().toISOString(),
    });
    await waitShell(manager, ".agent-bar");
    expect("01 initial tab exists", browser.listTabs().length === 1);
    expect("01a BrowserAgentBar renders task state", Boolean(
      await manager.shellWebContents()?.executeJavaScript(
        "document.querySelector('.agent-bar')?.textContent.includes('Find Agent roles')",
        true,
      ),
    ));
    await manager.shellWebContents()?.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('.agent-bar button')]
        .find((item) => item.textContent.includes('我来操作'));
      button?.click();
    })()`, true);
    await until(() => agentCommands.includes("takeover"));
    expect("01b BrowserAgentBar sends takeover command", true);
    expect("02 active tab is page 1", browser.getActiveTab()?.title === "QA Page One");

    const observation = await browser.snapshot(true);
    expect("03 DOM snapshot contains role", observation.page.text.includes("Agent Engineer"));
    expect("04 AX snapshot exists", observation.accessibility.length > 0);
    expect("05 screenshot is bounded", Boolean(
      observation.screenshot && observation.screenshot.width <= 1280 &&
      observation.screenshot.height <= 960,
    ));
    const webmail = await runBrowserWebmailQa({ browser, allowedDomain: "127.0.0.1" });
    expect("05a Browser Webmail captures real page evidence", webmail.bodyVerified && webmail.provider === "browser_webmail");
    expect("05b Browser Webmail message dedupes", webmail.dedupeCount === 1);
    const buttons = await browser.queryElements({ role: "button" });
    expect("06 semantic button query", buttons.elements.length >= 3);
    const labelledMail = await browser.queryElements({ text: "Interview invitation row" });
    expect("06a semantic query includes accessible labels", labelledMail.elements.length >= 1);
    const frame = await browser.queryElements({ selector: "#frame-button" });
    expect("07 same-origin frame query", Boolean(frame.elements[0]?.framePath.length));
    const shadow = await browser.queryElements({ selector: "#shadow-button" });
    expect("08 open shadow query", Boolean(shadow.elements[0]?.shadowPath.length));
    await browser.waitFor({ kind: "text", value: "Agent Engineer" });
    expect("09 wait for text", true);
    await browser.waitFor({ kind: "element", value: "#editor" });
    expect("10 wait for element", true);

    grant("QA pointer actions");
    let tagged = await operator.tagElements();
    const byLabel = (label: string) => tagged.find((item) => item.label === label)?.fillId;
    const hoverId = byLabel("Hover target");
    const sourceId = byLabel("Drag source");
    const targetId = byLabel("Drop target");
    const editorId = byLabel("Editor");
    const submitId = byLabel("Submit application");
    const mailRowId = byLabel("Interview invitation row");
    expect("11 nested/action elements tagged", Boolean(
      hoverId && sourceId && targetId && editorId && submitId && mailRowId,
    ));
    await operator.clickElement(mailRowId!);
    const openedMail = await browser.queryElements({ selector: "[data-opened='true']" });
    expect("11a ARIA mail row is tagged and clickable", openedMail.elements.length === 1);
    await browser.hover(hoverId!);
    const hovered = await browser.queryElements({ selector: "[data-hovered='true']" });
    expect("12 hover event applied", hovered.elements.length === 1);
    await browser.drag(sourceId!, targetId!);
    const dropped = await browser.queryElements({ selector: "[data-dropped='true']" });
    expect("13 drag/drop event applied", dropped.elements.length === 1);
    await browser.keypress({ key: "a", fillId: editorId! });
    tagged = await operator.tagElements();
    const editorValue = tagged.find((item) => item.fillId === editorId)?.currentValue;
    expect("14 keypress writes focused input", editorValue === "a", { editorValue });
    let clickSubmitBlocked = false;
    try { await operator.clickElement(submitId!); } catch { clickSubmitBlocked = true; }
    expect("14a submit click remains blocked", clickSubmitBlocked);
    let enterBlocked = false;
    try { await browser.keypress({ key: "Enter", fillId: editorId! }); }
    catch { enterBlocked = true; }
    expect("14b Enter submit bypass remains blocked", enterBlocked);
    const managedApply = await runManagedApplyQa({
      browser,
      operator,
      targetUrl: `${fixture.baseUrl}/page-1`,
    });
    expect("14c SubmissionIntent confirms fixture form", managedApply.receiptStatus === "confirmed");
    expect("14d SubmissionReceipt creates Tracker once", managedApply.applicationCount === 1);

    const firstId = browser.getActiveTab()!.id;
    grant("QA create tab");
    const second = browser.newTab(`${fixture.baseUrl}/page-2`);
    await browser.waitFor({ kind: "load" });
    expect("15 new tab navigates", browser.getActiveTab()?.id === second.id);
    expect("16 tab list has two entries", browser.listTabs().length === 2);
    grant("QA select tab");
    browser.selectTab(firstId);
    expect("17 select tab changes active", browser.getActiveTab()?.id === firstId);
    grant("QA navigate");
    browser.navigate(`${fixture.baseUrl}/page-2?from=navigate`);
    await browser.waitFor({ kind: "url", value: "from=navigate" });
    expect("18 navigate reaches URL", browser.getActiveTab()?.url?.includes("from=navigate") === true);
    grant("QA back");
    browser.goBack();
    await browser.waitFor({ kind: "url", value: "/page-1" });
    expect("19 history back", browser.getActiveTab()?.url?.endsWith("/page-1") === true);
    grant("QA forward");
    browser.goForward();
    await browser.waitFor({ kind: "url", value: "from=navigate" });
    expect("20 history forward", true);
    grant("QA reload");
    browser.reload();
    await browser.waitFor({ kind: "network_idle" });
    expect("21 reload settles", browser.getActiveTab()?.isLoading === false);
    grant("QA close tab");
    browser.closeTab(second.id);
    expect("22 close tab leaves one", browser.listTabs().length === 1);
    grant("QA download");
    const downloaded = await browser.download(
      `${fixture.baseUrl}/download`, "qa-download.txt", 5_000,
    );
    expect("23 download completion is observed without path", Boolean(
      downloaded.status === "completed" &&
      downloaded.filename === "qa-download.txt" &&
      !("savePath" in downloaded),
    ));
    grant("QA invalid URL");
    let invalidBlocked = false;
    try { browser.navigate("javascript:alert(1)"); } catch { invalidBlocked = true; }
    expect("24 unsafe URL blocked", invalidBlocked);
    operator.revokeWriteAccess("QA verify no grant");
    let ungrantedBlocked = false;
    try { browser.reload(); } catch { ungrantedBlocked = true; }
    expect("25 ungranted control blocked", ungrantedBlocked);

    const report = {
      passed: results.length,
      runtime: { electron: process.versions.electron, platform: process.platform },
      results,
    };
    await writeReport(report);
  } finally {
    manager.dispose();
    if (!main.isDestroyed()) main.destroy();
    await closeServer(server);
    clearInterval(keepAlive);
    app.quit();
  }
}).catch(async (error: unknown) => {
  await writeReport({ passed: results.length, results,
    diagnostics,
    error: error instanceof Error ? error.stack : String(error) }).catch(() => {});
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  clearInterval(keepAlive);
  app.exit(1);
});

function writeReport(value: unknown): Promise<void> {
  const path = process.env.COOLTO_BROWSER_QA_REPORT;
  return path
    ? writeFile(path, JSON.stringify(value, null, 2), "utf8")
    : Promise.resolve();
}

async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const fixtureServer = createServer((request, response) => {
    if (request.url?.startsWith("/download")) {
      diagnostics.fixtureDownloadRequests += 1;
      response.setHeader("content-type", "application/octet-stream");
      response.setHeader("content-disposition", "attachment; filename=qa-download.txt");
      const body = Buffer.from("download fixture");
      response.setHeader("content-length", String(body.length));
      response.end(body);
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url?.startsWith("/frame")) response.end(frameHtml);
    else if (request.url?.startsWith("/page-2")) response.end(pageTwoHtml);
    else response.end(pageOneHtml);
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  const address = fixtureServer.address();
  if (!address || typeof address === "string") throw new Error("QA server address unavailable");
  return { server: fixtureServer, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(value: Server | undefined): Promise<void> {
  return new Promise((resolve) => value ? value.close(() => resolve()) : resolve());
}
