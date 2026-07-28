import type {
  ApplicationRecord,
  ApplicationStatus,
} from "../../../shared/types.js";

export interface ApplicationBoardColumn {
  key: ApplicationStageKey;
  title: string;
  description: string;
  statuses: readonly ApplicationStatus[];
}

export type ApplicationStageKey = "applied" | "screening" | "interviewing" | "result";
export type TrackerViewMode = "board" | "timeline" | "calendar";

export const APPLICATION_BOARD_COLUMNS: readonly ApplicationBoardColumn[] = [
  {
    key: "applied",
    title: "已投递",
    description: "等待招聘方反馈",
    statuses: ["applied"],
  },
  {
    key: "screening",
    title: "筛选沟通",
    description: "简历筛选与初步联系",
    statuses: ["screening"],
  },
  {
    key: "interviewing",
    title: "面试",
    description: "进入面试流程",
    statuses: ["interviewing"],
  },
  {
    key: "result",
    title: "结果",
    description: "Offer、拒绝或无回应",
    statuses: ["offer", "rejected", "no_response"],
  },
];

export function applicationsInColumn(
  applications: ApplicationRecord[],
  statuses: readonly ApplicationStatus[],
): ApplicationRecord[] {
  return applications.filter((application) => statuses.includes(application.status));
}

export function applicationStage(status: ApplicationStatus): ApplicationStageKey {
  if (status === "applied" || status === "screening" || status === "interviewing") {
    return status;
  }
  return "result";
}

export function applicationStageIndex(status: ApplicationStatus): number {
  return APPLICATION_BOARD_COLUMNS.findIndex((column) => column.key === applicationStage(status));
}
