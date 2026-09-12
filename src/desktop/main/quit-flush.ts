import { app } from "electron";

import type { UserServicesResolver } from "./user-services.js";

let pendingQuitFlush: Promise<void> | undefined;
let quitFlushRegistered = false;

export function setPendingQuitFlush(flush: Promise<void>): void {
  pendingQuitFlush = flush;
}

export function registerQuitFlush(services: UserServicesResolver): void {
  if (quitFlushRegistered) return;
  quitFlushRegistered = true;
  let flushed = false;
  app.on("before-quit", (event) => {
    if (flushed) return;
    flushed = true;
    event.preventDefault();
    void (async () => {
      try {
        await Promise.race([
          pendingQuitFlush ?? services.flushPending().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);
      } catch {
        // Never block quitting on a failed snapshot.
      } finally {
        app.quit();
      }
    })();
  });
}
