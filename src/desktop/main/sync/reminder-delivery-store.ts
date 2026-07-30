import type { DatabaseSync } from "node:sqlite";

export class ReminderDeliveryStore {
  public constructor(private readonly database: DatabaseSync) {}

  public has(reminderId: string, remindAt: string): boolean {
    return Boolean(this.database.prepare(`
      SELECT 1 FROM reminder_delivery_receipts
      WHERE reminder_id = ? AND remind_at = ?
    `).get(reminderId, remindAt));
  }

  public record(reminderId: string, remindAt: string, deliveredAt: string): void {
    this.database.prepare(`
      INSERT OR IGNORE INTO reminder_delivery_receipts (
        reminder_id, remind_at, delivered_at
      ) VALUES (?, ?, ?)
    `).run(reminderId, remindAt, deliveredAt);
    this.database.prepare(`
      DELETE FROM reminder_delivery_receipts
      WHERE reminder_id = ? AND remind_at <> ?
    `).run(reminderId, remindAt);
  }
}

