import type { PrepareStagingInput } from "./update-staging.js";

export interface UpdateInfo {
  version?: string;
  files?: Array<{ url: string; sha512?: string; size?: number }>;
}

export interface UpdateDriverEventMap {
  "checking-for-update": () => void;
  "update-available": (info: UpdateInfo) => void;
  "update-not-available": (info: UpdateInfo) => void;
  "download-progress": (progress: { percent: number }) => void;
  "update-downloaded": (info: UpdateInfo) => void;
  "error": (error: Error) => void;
}

export interface UpdateDriver {
  autoDownload: boolean;
  forceDevUpdateConfig: boolean;
  setFeedURL(url: string): void;
  checkForUpdates(): Promise<unknown>;
  /** Runs the downloaded installer and quits the app (NSIS/Windows flow). */
  quitAndInstall(): void;
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
  /**
   * Process platform; defaults to process.platform. Windows runs the native
   * electron-updater NSIS flow (auto-download + quitAndInstall); macOS keeps
   * the self-owned zip staging/replace flow.
   */
  platform?: NodeJS.Platform;
}
