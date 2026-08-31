import type { AiNativeArtifactV1 } from "../../../agent-task/ai-native-artifact-types.js";

export function normalizeFollowUpSchedule(
  scheduledFor: string,
  timezone: string,
  now = Date.now(),
): { scheduledFor: string; timezone: string } {
  const timestamp = Date.parse(scheduledFor);
  if (!Number.isFinite(timestamp) || timestamp < now - 5 * 60_000) {
    throw new Error("跟进计划时间无效或已经过期");
  }
  const normalizedTimezone = timezone.trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: normalizedTimezone }).format(now);
  } catch {
    throw new Error("跟进时区必须是有效 IANA timezone");
  }
  return {
    scheduledFor: new Date(timestamp).toISOString(),
    timezone: normalizedTimezone,
  };
}

export function assertFollowUpSpacing(
  artifacts: AiNativeArtifactV1[],
  applicationId: string,
  scheduledFor: string,
  checkIntervalHours: number,
): void {
  const timestamp = Date.parse(scheduledFor);
  const minimumGap = checkIntervalHours * 3_600_000;
  const tooClose = artifacts.some((artifact) => artifact.kind === "follow_up_draft" &&
    artifact.applicationId === applicationId &&
    Math.abs(Date.parse(artifact.scheduledFor) - timestamp) < minimumGap);
  if (tooClose) throw new Error("同一投递的跟进计划尚未达到授权检查间隔");
}
