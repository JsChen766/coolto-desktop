const FORBIDDEN_CLAIMS_ZH =
  /提升|降低|增长|减少|节省|实现|达成|确保|保障|成功|赢得|获得|推动|促进|优化|改进|增强|解决|主导|负责|管理|设计|开发|搭建|使用|运用|交付|完成|产出|覆盖/u;
const FORBIDDEN_CLAIMS_EN = new Set([
  "achieve", "achieved", "build", "built", "create", "created", "deliver",
  "delivered", "design", "designed", "develop", "developed", "ensure",
  "ensured", "improve", "improved", "increase", "increased", "lead", "led",
  "manage", "managed", "optimize", "optimized", "reduce", "reduced", "save",
  "saved", "successfully",
]);
const MECHANICAL_PADDING =
  /工作脉络|统一复核|持续跟踪|信息呈现方式|前后一致|形成闭环|方法论支撑|可复用(?:分析|框架)|为后续(?:研究|工作|决策)提供/u;

/** Fact-neutral text may organize an existing claim but may not create one. */
export function validateFactNeutralFragment(
  fragment: string,
  language: string,
): void {
  const value = fragment.trim();
  if (!value) throw new Error("中性补齐片段不能为空");
  if ([...value].length > 160) throw new Error("中性补齐片段过长");
  if (/\d|[％%￥$€£¥]|https?:|www\.|@/iu.test(value)) {
    throw new Error("中性补齐不得加入数字、金额、比例、网址或账号");
  }
  if (/[“”‘’「」『』《》]/u.test(value)) {
    throw new Error("中性补齐不得加入带专名含义的引号或书名号内容");
  }
  if (language === "zh-CN") {
    if (/[A-Za-z]/u.test(value)) {
      throw new Error("中文中性补齐不得加入新的英文实体、工具或缩写");
    }
    if (FORBIDDEN_CLAIMS_ZH.test(value)) {
      throw new Error("中性补齐不得加入动作、结果或因果性事实主张");
    }
    if (MECHANICAL_PADDING.test(value)) {
      throw new Error("中性补齐不得使用机械复核、跟踪、闭环或方法论尾缀");
    }
  } else {
    const words = value.toLocaleLowerCase().match(/[a-z]+(?:-[a-z]+)*/gu) ?? [];
    if (!words.length || words.some((word) => FORBIDDEN_CLAIMS_EN.has(word))) {
      throw new Error("fact-neutral text must not add actions, results, or causal claims");
    }
  }
}
