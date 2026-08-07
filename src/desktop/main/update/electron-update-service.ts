import { basename, join } from "node:path";

import type {
  AppUpdateState,
  UpdateStateEvent,
  UpdateTrigger,
} from "../../shared/types.js";
import {
  dispatchReplaceScript,
  findAppBundleInStaging,
  locateAppBundle,
  recoverPendingBackup,
} from "./update-installer.js";
import {
  prepareStaging,
  type PrepareStagingInput,
} from "./update-staging.js";
import { initialState, reduceUpdateState } from "./update-state.js";

export interface UpdateInfo {
  version?: string;
  files?: Array<{ url: string; sha512?: string; size?: number }>;
}

export interface UpdateDriverEventMap {
  "checking-for-update": () => void;
  "update-available": (info: UpdateInfo) => void;
  "update-not-available": (info: UpdateInfo) => void;
  "error": (error: Error) => void;
}

export interface UpdateDriver {
  autoDownload: boolean;
  forceDevUpdateConfig: boolean;
  setFeedURL(url: string): void;
  checkForUpdates(): Promise<unknown>;
  on<Event extends keyof UpdateDriverEventMap>(
    event: Event,
    listener: UpdateDriverEventMap[Event],
  ): unknown;
}

export interface ElectronUpdateServiceOptions {
  feedUrl: string;
  currentVersion: () => string;
  /** Enable update checks in unpackaged dev mode (local feed simulation). */
  forceDev?: boolean;
  /** Whether the app is packaged (install only runs for packaged apps). */
  isPackaged: boolean;
  /** Path of the running executable, used to locate the app bundle. */
  exePath: () => string;
  /** Root directory that holds per-version staging folders. */
  stagingRoot: string;
  /** Called to exit the app after replacement is dispatched. */
  quit: () => void;
  /** Injected for tests. */
  download?: PrepareStagingInput["download"];
  extractZip?: PrepareStagingInput["extractZip"];
  launchCommand?: string;
}

export class ElectronUpdateService {
  private state: AppUpdateState;
  private readonly listeners = new Set<(state: AppUpdateState) => void>();
  private checkingPromise: Promise<void> | null = null;
  private downloadPromise: Promise<void> | null = null;
  private pendingUpdate: UpdateInfo | null = null;

  public constructor(
    private readonly driver: UpdateDriver,
    private readonly options: ElectronUpdateServiceOptions,
  ) {
    this.state = initialState(options.currentVersion());
  }

  public init(): void {
    this.driver.forceDevUpdateConfig = this.options.forceDev ?? false;
    this.driver.autoDownload = false;
    this.driver.setFeedURL(this.options.feedUrl);
    this.driver.on("checking-for-update", () =>
      this.apply({ type: "checking" }),
    );
    this.driver.on("update-available", (info) => {
      this.pendingUpdate = info;
      this.apply({ type: "available", version: info?.version ?? "未知版本" });
      void this.startDownload();
    });
    this.driver.on("update-not-available", () =>
      this.apply({ type: "not-available" }),
    );
    this.driver.on("error", (error) =>
      this.apply({
        type: "error",
        message: errorMessage(error),
        stage: "check",
      }),
    );
  }

  public getState(): AppUpdateState {
    return structuredClone(this.state);
  }

  public subscribe(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async checkForUpdates(_trigger: UpdateTrigger): Promise<void> {
    if (this.checkingPromise) return this.checkingPromise;
    this.checkingPromise = (async () => {
      try {
        await this.driver.checkForUpdates();
      } catch (error) {
        this.apply({
          type: "error",
          message: errorMessage(error),
          stage: "check",
        });
      } finally {
        this.checkingPromise = null;
      }
    })();
    return this.checkingPromise;
  }

  public install(): void {
    const state = this.state;
    if (state.phase !== "downloaded" || !state.updateVersion) return;
    if (!this.options.isPackaged) {
      this.apply({
        type: "error",
        message: "开发模式不支持自动安装，请从发布页手动下载。",
        stage: "install",
      });
      return;
    }
    void this.dispatchReplacement(state.updateVersion);
  }

  /** Startup self-check: recovers a backup left by an interrupted update. */
  public async checkPendingInstall(): Promise<void> {
    if (!this.options.isPackaged) return;
    try {
      const recovered = await recoverPendingBackup(
        this.options.stagingRoot,
        locateAppBundle(this.options.exePath()),
      );
      if (!recovered) return;
      this.apply({
        type: "error",
        message: "上次更新未完成，已恢复当前版本，可重新检查更新。",
        stage: "install",
      });
    } catch (error) {
      console.error("[update] recovery failed:", error);
    }
  }

  private startDownload(): Promise<void> {
    if (this.downloadPromise) return this.downloadPromise;
    const files = this.pendingUpdate?.files;
    if (!files?.length) {
      this.apply({
        type: "error",
        message: "更新源没有可下载的更新包。",
        stage: "install",
      });
      return Promise.resolve();
    }
    const version = this.pendingUpdate?.version ?? "unknown";
    this.downloadPromise = (async () => {
      try {
        await prepareStaging({
          version,
          stagingRoot: this.options.stagingRoot,
          feedUrl: this.options.feedUrl,
          files,
          onProgress: (progress) =>
            this.apply({
              type: "download-progress",
              percent: progress.percent,
            }),
          ...(this.options.download
            ? { download: this.options.download }
            : {}),
          ...(this.options.extractZip
            ? { extractZip: this.options.extractZip }
            : {}),
        });
        this.apply({ type: "downloaded", version });
      } catch (error) {
        this.apply({
          type: "error",
          message: errorMessage(error),
          stage: "install",
        });
      } finally {
        this.downloadPromise = null;
      }
    })();
    return this.downloadPromise;
  }

  private async dispatchReplacement(version: string): Promise<void> {
    const staging = join(this.options.stagingRoot, version);
    try {
      const bundle = await findAppBundleInStaging(staging);
      if (!bundle) throw new Error("更新文件不完整，请重试。");
      const exePath = this.options.exePath();
      await dispatchReplaceScript({
        appPath: locateAppBundle(exePath),
        exePath,
        stagingDir: staging,
        appName: basename(bundle),
        zipName: "update.zip",
        ...(this.options.launchCommand
          ? { launchCommand: this.options.launchCommand }
          : {}),
      });
      this.apply({ type: "installing" });
      this.options.quit();
    } catch (error) {
      this.apply({
        type: "error",
        message: `更新安装失败：${errorMessage(error)}`,
        stage: "install",
      });
    }
  }

  private apply(event: UpdateStateEvent): void {
    this.state = reduceUpdateState(this.state, event);
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}
