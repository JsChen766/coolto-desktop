export interface CalendarTarget {
  applicationId: string;
  interviewId: string;
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
