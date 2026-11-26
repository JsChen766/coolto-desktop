import { app } from "electron";

import type { UserServicesResolver } from "./user-services.js";

let pendingQuitFlush: Promise<void> | undefined;
let quitFlushRegistered = false;
let flushed = false;

export function setPendingQuitFlush(flush: Promise<void>): void {
  pendingQuitFlush = flush;
}

// A quit attempt was cancelled (a window prevented its close): the next quit
// must flush again instead of reusing this attempt's stale snapshot.
export function resetQuitFlush(): void {
  flushed = false;
  pendingQuitFlush = undefined;
}

export function registerQuitFlush(services: UserServicesResolver): void {
  if (quitFlushRegistered) return;
  quitFlushRegistered = true;
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
