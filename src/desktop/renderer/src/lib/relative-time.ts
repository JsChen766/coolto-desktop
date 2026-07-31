import { localeCode, translate } from "../i18n/locale";

export function relativeTime(value: string, now = Date.now()): string {
  const elapsed = now - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return translate("刚刚");
  if (minutes < 60) return localeCode() === "zh-CN" ? `${minutes} 分钟` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return localeCode() === "zh-CN" ? `${hours} 小时` : `${hours} hr`;
  const days = Math.floor(hours / 24);
  if (days < 7) return localeCode() === "zh-CN" ? `${days} 天` : `${days} day${days === 1 ? "" : "s"}`;
  return new Intl.DateTimeFormat(localeCode(), {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}
