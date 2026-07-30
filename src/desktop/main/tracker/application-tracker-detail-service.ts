import type { ApplicationTrackerDetail } from "../../../tracker/child-types.js";
import { InterviewSyncStore } from "./interview-sync-store.js";
import { NoteSyncStore } from "./note-sync-store.js";
import { ReminderSyncStore } from "./reminder-sync-store.js";
import { StatusEventReader } from "./status-event-reader.js";

export class ApplicationTrackerDetailService {
  public constructor(
    private readonly events: StatusEventReader,
    private readonly interviews: InterviewSyncStore,
    private readonly notes: NoteSyncStore,
    private readonly reminders: ReminderSyncStore,
  ) {}

  public async get(applicationId: string): Promise<ApplicationTrackerDetail> {
    const id = applicationId.trim();
    if (!id) throw new Error("applicationId 不能为空");
    const [statusEvents, interviews, notes, reminders] = await Promise.all([
      this.events.list(id), this.interviews.list(id), this.notes.list(id), this.reminders.list(id),
    ]);
    return { statusEvents, interviews, notes, reminders };
  }

  public async overview(): Promise<ApplicationTrackerDetail> {
    const [statusEvents, interviews, notes, reminders] = await Promise.all([
      this.events.list(), this.interviews.list(), this.notes.list(), this.reminders.list(),
    ]);
    return { statusEvents, interviews, notes, reminders };
  }
}
