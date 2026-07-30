import { Notification, type BrowserWindow } from "electron";

import type { LocalSyncStore } from "../sync/local-sync-store.js";
import { ReminderSyncStore } from "./reminder-sync-store.js";
import { ReminderSchedulerCore } from "./reminder-scheduler-core.js";

const SCAN_INTERVAL_MS = 15_000;

export class ReminderNotificationScheduler {
  readonly #core: ReminderSchedulerCore;
  readonly #timer: ReturnType<typeof setInterval>;
  #disposed = false;

  public constructor(
    reminders: ReminderSyncStore,
    ledger: LocalSyncStore,
    window: BrowserWindow,
  ) {
    this.#core = new ReminderSchedulerCore(
      reminders,
      ledger,
      window,
      (reminder, missed) => new Notification({
        title: missed ? "错过的求职提醒" : "求职提醒",
        body: reminder.title,
        silent: false,
      }),
    );
    this.#timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
    this.#timer.unref();
    void this.scan();
  }

  public async scan(): Promise<void> {
    if (this.#disposed || !Notification.isSupported()) return;
    await this.#core.scan();
  }

  public dispose(): void {
    this.#disposed = true;
    clearInterval(this.#timer);
    this.#core.dispose();
  }
}
