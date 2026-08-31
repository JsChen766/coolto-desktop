import { app, type BrowserWindow } from "electron";

interface CalendarTarget {
  applicationId: string;
  interviewId: string;
}

export class CalendarDeepLinkRouter {
  #pending: CalendarTarget | null = null;

  public constructor(private readonly window: () => BrowserWindow | undefined) {}

  public listen(): void {
    app.on("open-url", (event, url) => {
      event.preventDefault();
      this.#accept(url);
    });
    if (app.isPackaged) app.setAsDefaultProtocolClient("coolto");
  }

  public acceptArguments(arguments_: readonly string[]): void {
    const url = arguments_.find((value) => value.startsWith("coolto://"));
    if (url) this.#accept(url);
  }

  public flush(): void {
    if (!this.#pending) return;
    const window = this.window();
    if (!window || window.isDestroyed() || window.webContents.isLoadingMainFrame()) return;
    window.webContents.send("calendar:open-interview", this.#pending);
    this.#pending = null;
  }

  #accept(url: string): void {
    const target = parseCalendarDeepLink(url);
    if (!target) return;
    this.#pending = target;
    const window = this.window();
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
    this.flush();
  }
}

export function parseCalendarDeepLink(value: string): CalendarTarget | null {
  try {
    const url = new URL(value);
    const match = /^\/application\/([^/]+)$/u.exec(url.pathname);
    const interviewId = url.searchParams.get("interview")?.trim();
    if (url.protocol !== "coolto:" || url.hostname !== "tracker" || !match ||
        !interviewId || interviewId.length > 240) return null;
    const applicationId = decodeURIComponent(match[1]!).trim();
    if (!applicationId || applicationId.length > 240) return null;
    return { applicationId, interviewId };
  } catch {
    return null;
  }
}
