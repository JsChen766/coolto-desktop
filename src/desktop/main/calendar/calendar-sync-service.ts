import type { CalendarAdapter } from "../../../calendar/calendar-adapter.js";
import { calendarEventFingerprint } from "../../../calendar/interview-calendar-event.js";
import { planInterviewCalendarSync } from "../../../calendar/calendar-sync-plan.js";
import type {
  CalendarAuthorizationStatus,
  CalendarLink,
  CalendarLinkRepository,
  CalendarStatusView,
  CalendarSyncPlan,
  CalendarSyncResult,
} from "../../../calendar/calendar-types.js";
import type { ApplicationSyncStore } from "../application-library/application-sync-store.js";
import type { InterviewSyncStore } from "../tracker/interview-sync-store.js";
import type { ReminderSyncStore } from "../tracker/reminder-sync-store.js";

export class CalendarSyncService {
  readonly #pending = new Map<string, Promise<CalendarSyncResult>>();

  public constructor(
    private readonly adapter: CalendarAdapter,
    private readonly links: CalendarLinkRepository,
    private readonly applications: ApplicationSyncStore,
    private readonly interviews: InterviewSyncStore,
    private readonly reminders: ReminderSyncStore,
  ) {}

  public async status(): Promise<CalendarStatusView> {
    return statusView(await this.adapter.authorizationStatus());
  }

  public async requestAccess(
    level: "write_only" | "full_access",
  ): Promise<CalendarStatusView> {
    return statusView(await this.adapter.requestAccess(level));
  }

  public syncInterview(applicationId: string, interviewId: string): Promise<CalendarSyncResult> {
    const existing = this.#pending.get(interviewId);
    if (existing) return existing;
    const running = this.#sync(applicationId, interviewId).finally(() => {
      if (this.#pending.get(interviewId) === running) this.#pending.delete(interviewId);
    });
    this.#pending.set(interviewId, running);
    return running;
  }

  public openSystemSettings(): Promise<void> {
    return this.adapter.openSystemSettings();
  }

  public clearAll(): Promise<void> {
    return this.links.clearAll();
  }

  async #sync(applicationId: string, interviewId: string): Promise<CalendarSyncResult> {
    const [application, interview, authorization, link, reminders] = await Promise.all([
      this.applications.get(applicationId), this.interviews.get(interviewId),
      this.adapter.authorizationStatus(), this.links.get(interviewId),
      this.reminders.list(applicationId),
    ]);
    const deepLink = calendarDeepLink(application.id, interview.id);
    const plan = planInterviewCalendarSync({
      application, interview, deepLink, authorization, link, reminders,
    });
    return this.#execute(plan, application.id, interview.id);
  }

  async #execute(
    plan: CalendarSyncPlan,
    applicationId: string,
    interviewId: string,
  ): Promise<CalendarSyncResult> {
    switch (plan.kind) {
      case "none":
        return { outcome: "unchanged", message: plan.reason === "unchanged"
          ? "系统日历已是最新状态" : "当前面试不需要同步到系统日历" };
      case "blocked":
        return { outcome: "blocked", message: plan.message };
      case "request_write_only":
        return { outcome: "permission_required", requiredAccess: "write_only",
          message: "需要允许 Coolto 向系统日历添加事件" };
      case "request_full_access":
        return { outcome: "permission_required", requiredAccess: "full_access",
          message: "改期或取消已有事件需要完整 Calendar 权限" };
      case "create": {
        const identity = await this.adapter.createEvent(plan.draft);
        const now = new Date().toISOString();
        await this.links.upsert({
          applicationId, interviewId, ...identity,
          eventFingerprint: calendarEventFingerprint(plan.draft),
          createdAt: now, updatedAt: now,
        });
        return { outcome: "created", message: "面试已添加到系统日历" };
      }
      case "update": {
        const identity = await this.adapter.updateEvent(
          plan.link.eventIdentifier, plan.draft,
        );
        await this.links.upsert(updatedLink(plan.link, identity,
          calendarEventFingerprint(plan.draft)));
        return { outcome: "updated", message: "系统日历中的面试已更新" };
      }
      case "cancel":
        await this.adapter.cancelEvent(plan.link.eventIdentifier);
        await this.links.remove(interviewId);
        return { outcome: "canceled", message: "系统日历中的面试已取消" };
    }
  }
}

function updatedLink(
  link: CalendarLink,
  identity: { eventIdentifier: string; calendarIdentifier: string | null },
  fingerprint: string,
): CalendarLink {
  return {
    ...link, ...identity, eventFingerprint: fingerprint,
    updatedAt: new Date().toISOString(),
  };
}

function statusView(authorization: CalendarAuthorizationStatus): CalendarStatusView {
  const supported = authorization !== "unavailable";
  return {
    supported,
    authorization,
    canCreate: authorization === "write_only" || authorization === "full_access",
    canModify: authorization === "full_access",
    message: ({
      not_determined: "尚未授权系统日历",
      write_only: "可添加事件；改期或取消需要完整权限",
      full_access: "可添加、改期和取消 Coolto 关联事件",
      denied: "系统日历权限已拒绝",
      restricted: "系统限制了日历权限",
      unavailable: "当前设备不支持 macOS Calendar",
    })[authorization],
  };
}

function calendarDeepLink(applicationId: string, interviewId: string): string {
  return `coolto://tracker/application/${encodeURIComponent(applicationId)}` +
    `?interview=${encodeURIComponent(interviewId)}`;
}
