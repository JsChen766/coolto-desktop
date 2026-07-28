import type { ApplicationStatus } from "./types.js";

const TRANSITIONS: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  applied: ["screening", "rejected", "no_response"],
  screening: ["interviewing", "rejected", "no_response"],
  interviewing: ["interviewing", "offer", "rejected", "no_response"],
  offer: [],
  rejected: [],
  no_response: [],
};

export function allowedApplicationTransitions(
  status: ApplicationStatus,
): readonly ApplicationStatus[] {
  return TRANSITIONS[status];
}

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminalApplicationStatus(
  status: ApplicationStatus,
): boolean {
  return TRANSITIONS[status].length === 0;
}
