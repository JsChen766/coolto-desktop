import type { Reminder } from "../../../tracker/child-types.js";
import { reminderDueState } from "../../../tracker/reminder-schedule.js";

const MISSED_WINDOW_MS = 24 * 60 * 60 * 1_000;

export interface ReminderSchedulerStore {
  list(): Promise<Reminder[]>;
  markDelivered(id: string, deliveredAt: string): Promise<Reminder>;
}

export interface ReminderDeliveryLedger {
  hasReminderDelivery(id: string, remindAt: string): boolean;
  recordReminderDelivery(id: string, remindAt: string, deliveredAt: string): void;
  getEntity(type: "application", id: string): { operation: "upsert" | "delete" } | undefined;
}

export interface ReminderNotificationPort {
  once(event: "show", listener: () => void): unknown;
  once(event: "failed", listener: (_event: unknown, error: string) => void): unknown;
  once(event: "click", listener: () => void): unknown;
  show(): void;
}

export interface ReminderWindowPort {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

export class ReminderSchedulerCore {
  readonly #active = new Set<string>();
  #disposed = false;

  public constructor(
    private readonly reminders: ReminderSchedulerStore,
    private readonly ledger: ReminderDeliveryLedger,
    private readonly window: ReminderWindowPort,
    private readonly createNotification: (
      reminder: Reminder, missed: boolean,
    ) => ReminderNotificationPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async scan(): Promise<void> {
    if (this.#disposed) return;
    const now = this.now();
    const reminders = await this.reminders.list().catch(() => []);
    for (const reminder of reminders) {
      if (this.#eligible(reminder, now)) this.#show(reminder, now);
    }
  }

  public dispose(): void {
    this.#disposed = true;
    this.#active.clear();
  }

  #eligible(reminder: Reminder, now: Date): boolean {
    if (reminder.status !== "scheduled" || reminder.syncStatus === "conflict" ||
      reminder.syncStatus === "failed") return false;
    if (this.ledger.getEntity("application", reminder.applicationId)?.operation !== "upsert") {
      return false;
    }
    return reminderDueState(reminder.remindAt, now, MISSED_WINDOW_MS) === "due" &&
      !this.ledger.hasReminderDelivery(reminder.id, reminder.remindAt) &&
      !this.#active.has(this.#key(reminder));
  }

  #show(reminder: Reminder, now: Date): void {
    const key = this.#key(reminder);
    this.#active.add(key);
    const notification = this.createNotification(
      reminder, now.getTime() > Date.parse(reminder.remindAt),
    );
    notification.once("show", () => this.#delivered(reminder, key));
    notification.once("failed", () => this.#active.delete(key));
    notification.once("click", () => {
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
    });
    notification.show();
  }

  #delivered(reminder: Reminder, key: string): void {
    const deliveredAt = this.now().toISOString();
    this.ledger.recordReminderDelivery(reminder.id, reminder.remindAt, deliveredAt);
    this.#active.delete(key);
    void this.reminders.markDelivered(reminder.id, deliveredAt).catch(() => undefined);
  }

  #key(reminder: Reminder): string { return `${reminder.id}\0${reminder.remindAt}`; }
}
