import { wrapInternalPrompt } from "../../agent/internal-prompt.js";
import type { ApprovalDecision } from "../../approvals/types.js";

export function buildResumeAugmentationContinuationPrompt(
  candidateId: string,
  decision: Extract<ApprovalDecision, { type: "accept" | "reject" }>["type"],
): string {
  const outcome = decision === "accept" ? "已接受" : "已拒绝并移除";
  const nextStep = decision === "accept"
    ? "若只剩尾行 blocker，收尾写作额度只能用于批量修复当前简历的全部未通过尾行，不得借此新增经历或再次补写"
    : "若移除后使用率或数量不再达标，按原规则使用真实素材补足；只有用户仍要求严格完成且未拒绝追问时，真实素材不足才提出一个必要问题，否则保留当前最好草稿并调用 decline_resume_material 结束，不得换一条未经确认的补写继续尝试";
  return wrapInternalPrompt(
    `用户${outcome}本轮 AI 补写内容（candidateId: ${candidateId}）。` +
    `请立即调用 get_resume_workspace 读取当前权威状态，并继续用户原本的简历生成目标。` +
    `若 status 已是 ready_for_approval，简短告知用户简历已定稿且可以保存或导出；` +
    `若仍有布局 blocker，批量修复所有未通过项后重新实测，优先一次处理多个经历和 bullet。` +
    `${nextStep}。` +
    `任何 blocker 尚存时不得声称通过默认严格标准、基本完成或可以导出；用户要求停止追问时不得继续索取材料。`,
  );
}
