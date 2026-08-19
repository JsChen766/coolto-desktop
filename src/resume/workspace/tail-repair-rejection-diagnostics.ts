export interface TailRepairValidationReasonCounts {
  unchangedOrRepeated: number;
  contentQuality: number;
  unsupportedEvidence: number;
  other: number;
}

export function tailRepairValidationReasonCounts(
  reasons: readonly string[],
): TailRepairValidationReasonCounts {
  const counts: TailRepairValidationReasonCounts = {
    unchangedOrRepeated: 0,
    contentQuality: 0,
    unsupportedEvidence: 0,
    other: 0,
  };
  for (const reason of reasons) {
    if (/已经被拒绝|重复|重交完整/u.test(reason)) {
      counts.unchangedOrRepeated += 1;
    } else if (/空泛|抽象|句末标点/u.test(reason)) {
      counts.contentQuality += 1;
    } else if (/原有数字|数字缺少来源|evidence|grounded|来源记录|不属于 item/iu.test(reason)) {
      counts.unsupportedEvidence += 1;
    } else {
      counts.other += 1;
    }
  }
  return counts;
}
