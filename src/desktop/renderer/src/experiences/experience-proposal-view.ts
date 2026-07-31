import type {
  ExperienceProposalSnapshot,
  ExperienceWriteProposal,
} from "../../../../experience/maintenance-types.js";
import { EXPERIENCE_CATEGORY_LABELS } from "../../../../experience/timeline-labels.js";
import { localeCode, translate } from "../i18n/locale";

const FIELD_LABELS: Array<
  [keyof ExperienceProposalSnapshot, string]
> = [
  ["category", "类别"],
  ["title", "标题"],
  ["organization", "组织"],
  ["role", "角色"],
  ["location", "地点"],
  ["startDate", "开始时间"],
  ["endDate", "结束时间"],
  ["tags", "标签"],
  ["content", "经历正文"],
  ["status", "状态"],
];

export function experienceProposalTitle(
  proposal: ExperienceWriteProposal,
): string {
  const titles = {
    create: "确认新建经历",
    update: "确认保存修改",
    archive: "确认归档经历",
    restore: "确认恢复经历",
    delete: "确认删除经历",
    accept_server: "确认接受服务端版本",
    reapply: "确认重新应用本地修改",
    save_as_new: "确认另存为新经历",
    restore_revision: "确认恢复历史正文",
  };
  return translate(titles[proposal.kind]);
}

export function experienceProposalImpact(
  proposal: ExperienceWriteProposal,
): string {
  if (proposal.kind === "archive") {
    return translate("归档后仍可查看和恢复，但恢复前不会参与经历发现、匹配或简历生成。");
  }
  if (proposal.kind === "restore") {
    return translate("恢复后将重新参与经历发现、匹配和简历生成。");
  }
  if (proposal.kind === "delete") {
    return translate("删除后将从普通经历仓库移除且不能在普通界面恢复；已有冻结事实不会被删除。");
  }
  if (proposal.kind === "accept_server" && !proposal.next) {
    return translate("服务端已经删除这条经历；接受后本地副本也会从普通经历仓库移除。");
  }
  if (proposal.kind === "reapply") {
    return translate("本地修改将基于最新服务端版本重新提交，不会静默覆盖未知版本。");
  }
  if (proposal.kind === "save_as_new") {
    return translate("本地内容会保存为一条新的独立经历，原同步问题按服务端事实处理。");
  }
  if (proposal.kind === "restore_revision") {
    return translate("只恢复所选历史正文；其他字段保持当前值，并创建新的不可变正文版本。原历史不会被覆盖。");
  }
  return proposal.kind === "create"
    ? translate("确认后先保存到本机并写入 Outbox，随后由同步链路提交。")
    : revisionChanged(proposal)
      ? translate("经历正文已变化，将创建新的不可变正文版本。")
      : translate("正文没有变化，本次只更新元数据，不会创建新的正文版本。");
}

export function changedExperienceFields(
  proposal: ExperienceWriteProposal,
): Array<{ label: string; before: string; after: string }> {
  if (!proposal.next) return [];
  return FIELD_LABELS.flatMap(([key, label]) => {
    const before = proposal.current ? display(key, proposal.current[key]) : "—";
    const after = display(key, proposal.next?.[key]);
    return before === after ? [] : [{ label: translate(label), before, after }];
  });
}

export function revisionChanged(proposal: ExperienceWriteProposal): boolean {
  return Boolean(
    proposal.current
    && proposal.next
    && proposal.current.revisionHash !== proposal.next.revisionHash,
  );
}

function display(
  key: keyof ExperienceProposalSnapshot,
  value: ExperienceProposalSnapshot[typeof key] | undefined,
): string {
  if (value === null || value === undefined || value === "") return translate("未填写");
  if (key === "category") {
    return translate(EXPERIENCE_CATEGORY_LABELS[
      value as ExperienceProposalSnapshot["category"]
    ]);
  }
  if (key === "status") return translate(value === "archived" ? "已归档" : "在用");
  if (key === "endDate" && value === "present") return translate("至今");
  if (Array.isArray(value)) {
    return value.length ? value.join(localeCode() === "zh-CN" ? "、" : ", ") : translate("无");
  }
  return String(value);
}
