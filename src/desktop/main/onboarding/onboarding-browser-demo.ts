import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app } from "electron";
import { localScopeKey } from "../../../privacy/local-scope.js";

import type { BrowserPageOperator, FormElementSummary } from "../../../browser/types.js";
import type { BrowserWindowManager } from "../browser/browser-window-manager.js";

const PAGE_TITLE = "Coolto 示例申请";

export class OnboardingBrowserDemo {
  readonly #directory: string;
  readonly #resumePath: string;

  public constructor(
    apiBaseUrl: string,
    ownerId: string,
    private readonly browser: BrowserWindowManager,
    private readonly operator: BrowserPageOperator,
  ) {
    this.#directory = join(app.getPath("userData"), "onboarding-demo", localScopeKey(apiBaseUrl, ownerId));
    this.#resumePath = join(this.#directory, "Coolto-示例岗位简历.pdf");
  }

  public async openAndFill(theme: "light" | "dark"): Promise<void> {
    await this.#prepareResume();
    const existingTabIds = new Set(
      this.browser.tabs?.allTabs().map((tab) => tab.id) ?? [],
    );
    this.browser.openOnboardingDemo(demoPageUrl(theme), theme);
    await this.#waitForPage(existingTabIds);
    this.operator.grantWriteAccess("填写 Coolto 本地一次性示例申请页");
    try {
      const elements = await this.operator.tagElements();
      await this.operator.fillField(requireField(elements, "姓名").fillId, "林小满（示例）");
      await this.operator.fillField(
        requireField(elements, "简历联系邮箱").fillId,
        "demo@coolto.example",
      );
      await this.operator.fillField(requireField(elements, "所在地").fillId, "Hong Kong");
      await this.operator.uploadFile(
        requireField(elements, "测试简历").fillId,
        [this.#resumePath],
      );
      this.operator.enterReview();
    } catch (error) {
      this.operator.revokeWriteAccess("onboarding_demo_failed");
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    this.operator.revokeWriteAccess("onboarding_demo_complete");
    this.browser.close();
    await rm(this.#directory, { recursive: true, force: true });
  }

  async #prepareResume(): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    await writeFile(this.#resumePath, minimalPdf(), { mode: 0o600 });
  }

  async #waitForPage(existingTabIds: ReadonlySet<string>): Promise<void> {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const tabs = this.browser.tabs;
      const tab = tabs?.allTabs().find((candidate) =>
        !existingTabIds.has(candidate.id) && candidate.getState().title === PAGE_TITLE);
      const state = tab?.getState();
      if (tab && state?.title === PAGE_TITLE && !state.isLoading) {
        tabs?.select(tab.id);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("本地示例申请页加载超时");
  }
}

function requireField(
  fields: FormElementSummary[],
  label: string,
): FormElementSummary {
  const field = fields.find((candidate) => candidate.label.includes(label));
  if (!field) throw new Error(`示例申请页缺少字段：${label}`);
  return field;
}

function demoPageUrl(theme: "light" | "dark"): string {
  const dark = theme === "dark";
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${PAGE_TITLE}</title>
<style>body{font:15px system-ui;margin:0;background:${dark ? "#181818" : "#f7f7f5"};color:${dark ? "#eee" : "#222"}}
main{max-width:760px;margin:48px auto;padding:28px;background:${dark ? "#242424" : "#fff"};border-radius:12px}
h1{font-size:24px;margin:0 0 6px}p{color:${dark ? "#aaa" : "#666"}}form{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
label{display:grid;gap:6px}input{font:inherit;padding:10px;border:1px solid ${dark ? "#444" : "#ccc"};border-radius:8px;background:transparent;color:inherit}
.wide{grid-column:1/-1}.note{margin-top:22px;padding:12px;border-radius:8px;background:${dark ? "#303030" : "#eee"}}</style></head>
<body><main><h1>Nova Labs · 数据分析师</h1><p>Coolto 本地示例申请页，不会连接或提交到任何外部网站。</p>
<form onsubmit="return false"><label>姓名<input name="fullName" autocomplete="off"></label>
<label>简历联系邮箱<input name="email" type="email" autocomplete="off"></label>
<label>所在地<input name="location" autocomplete="off"></label>
<label>测试简历<input name="resume" type="file" accept=".pdf"></label></form>
<div class="note">填写后请使用 Coolto 的真实页内审核控件逐项接受或拒绝。</div></main></body></html>`;
  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function minimalPdf(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
  );
}
