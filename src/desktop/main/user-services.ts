import { app, type BrowserWindow } from "electron";
import type { BrowserAgentController } from "../../browser/agent-control-types.js";
import type { BrowserPageOperator } from "../../browser/types.js";
import type { BrowserAgentStatusBridge } from "./browser/browser-agent-status-bridge.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import { DesktopAuthService } from "./auth-service.js";
import { clearUserServices } from "./clear-user-services.js";
import { resetBrowserSessionScope } from "./browser/browser-session.js";
import { createUserServices } from "./create-user-services.js";
import type { UserServices } from "./user-services-contract.js";
import { localScopeDigest } from "../../privacy/local-scope.js";
import type { BrowserWindowManager } from "./browser/browser-window-manager.js";

export type { UserServices } from "./user-services-contract.js";

export class UserServicesResolver {
  private services: UserServices | undefined;
  private creation: Promise<void> = Promise.resolve();
  private generation = 0;

  public constructor(
    private readonly auth: DesktopAuthService,
    private readonly window: BrowserWindow,
    private readonly resumeCompiler: ResumePdfCompiler,
    private readonly browserAgentController: BrowserAgentController,
    private readonly browserPageOperator: BrowserPageOperator,
    private readonly browserAgentStatus: BrowserAgentStatusBridge,
    private readonly browserWindow: BrowserWindowManager,
  ) {}

  public get(): Promise<UserServices> {
    const next = this.creation.then(() => this.#build());
    this.creation = next.then(() => undefined, () => undefined);
    return next;
  }

  async #build(): Promise<UserServices> {
    const user = this.auth.requireCurrentUser();
    const apiBaseUrl = this.auth.apiBaseUrl;
    const scopeDigest = localScopeDigest(apiBaseUrl, user.id);
    if (this.services?.ownerId === user.id &&
        this.services.apiBaseUrl === apiBaseUrl &&
        this.services.scopeDigest === scopeDigest) {
      if (!this.auth.privacy.isCloudBusinessAllowed) {
        await this.#clearNow("account_changed");
        throw new Error("请先完成当前版本的隐私同意或删除恢复");
      }
      return this.services;
    }
    if (this.services) await this.#clearNow("account_changed");
    const expectedGeneration = this.generation;
    const built = await createUserServices({
      auth: this.auth,
      window: this.window,
      resumeCompiler: this.resumeCompiler,
      browserAgentController: this.browserAgentController,
      browserPageOperator: this.browserPageOperator,
      browserAgentStatus: this.browserAgentStatus,
      browserWindow: this.browserWindow,
    });
    const current = (() => {
      try { return this.auth.requireCurrentUser(); } catch { return undefined; }
    })();
    const stillCurrent = expectedGeneration === this.generation &&
      current?.id === built.ownerId && this.auth.apiBaseUrl === built.apiBaseUrl &&
      this.auth.privacy.isCloudBusinessAllowed;
    if (!stillCurrent) {
      await clearUserServices({
        current: built,
        reason: "account_changed",
        browser: this.browserPageOperator,
        status: this.browserAgentStatus,
      });
      resetBrowserSessionScope();
      throw new Error("账号或 API 来源在初始化期间发生变化");
    }
    this.services = built;
    return built;
  }

  public current(): UserServices | undefined { return this.services; }
  public quiesce(): Promise<void> {
    return this.creation.then(async () => {
      const current = this.services;
      if (!current) return;
      await current.agentTaskScheduler.quiesce();
      await current.reminderScheduler.quiesce();
      await current.agent.quiesce();
    });
  }

  public clear(reason: "window_closed" | "account_changed" = "window_closed"): Promise<void> {
    ++this.generation;
    const next = this.creation.then(() => this.#clearNow(reason));
    this.creation = next.then(() => undefined, () => undefined);
    return next;
  }

  async #clearNow(reason: "window_closed" | "account_changed"): Promise<void> {
    const current = this.services;
    this.services = undefined;
    try {
      await clearUserServices({
        current, reason, browser: this.browserPageOperator,
        status: this.browserAgentStatus,
      });
    } finally {
      resetBrowserSessionScope();
    }
  }

  public async flushPending(): Promise<void> {
    await this.services?.agent.flushPending();
  }
}
