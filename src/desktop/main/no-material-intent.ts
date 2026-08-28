export function hasNoMoreResumeMaterialIntent(
  value: string | undefined,
): boolean {
  if (!value) return false;
  return /(?:这些|全部|都).{0,8}(?:没有|没做过)|想不到|没有(?:更多|其他|补充)?(?:材料|证据|内容|东西)?|不需要补充|无需补充|跳过.{0,8}(?:警告|缺口|补充)|就这些|按(?:现有|当前)(?:材料|证据|内容|信息).{0,8}(?:继续|完成)|no more (?:material|evidence|information)|nothing (?:else|more) to add|skip (?:this )?warning/iu
    .test(value);
}
