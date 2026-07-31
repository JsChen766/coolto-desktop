import type { ApplicationRecord } from "../../../shared/types.js";
import { localeCode } from "../i18n/locale.js";

export interface ApplicationCalendarDay {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  applications: ApplicationRecord[];
}

export interface ApplicationCalendarMonth {
  year: number;
  month: number;
  label: string;
  days: ApplicationCalendarDay[];
}

export const CALENDAR_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export function initialCalendarAnchor(
  applications: ApplicationRecord[],
  now = new Date(),
): Date {
  const current = monthStart(now);
  if (applications.some((item) => sameMonth(item.appliedAt, current))) return current;
  const latest = applications
    .map((item) => item.appliedAt ? new Date(item.appliedAt) : null)
    .filter((value): value is Date => Boolean(value && !Number.isNaN(value.getTime())))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return monthStart(latest ?? now);
}

export function shiftCalendarMonth(anchor: Date, offset: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
}

export function buildApplicationCalendar(
  anchor: Date,
  applications: ApplicationRecord[],
  now = new Date(),
): ApplicationCalendarMonth {
  const month = monthStart(anchor);
  const mondayOffset = (month.getDay() + 6) % 7;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
  const todayKey = localDateKey(now);
  const byDate = new Map<string, ApplicationRecord[]>();
  for (const application of applications) {
    if (!application.appliedAt || !sameMonth(application.appliedAt, month)) continue;
    const key = localDateKey(new Date(application.appliedAt));
    const values = byDate.get(key) ?? [];
    values.push(application);
    byDate.set(key, values);
  }
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const dateKey = localDateKey(date);
    return {
      dateKey,
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === month.getMonth(),
      isToday: dateKey === todayKey,
      applications: [...(byDate.get(dateKey) ?? [])].sort(compareAppliedAt),
    };
  });
  return {
    year: month.getFullYear(),
    month: month.getMonth(),
    label: new Intl.DateTimeFormat(localeCode(), { year: "numeric", month: "long" }).format(month),
    days,
  };
}

function monthStart(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function sameMonth(value: string | null, month: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareAppliedAt(left: ApplicationRecord, right: ApplicationRecord): number {
  return (left.appliedAt ?? "").localeCompare(right.appliedAt ?? "");
}
