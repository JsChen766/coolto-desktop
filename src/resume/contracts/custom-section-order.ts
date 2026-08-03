export interface ImportedCustomSection {
  sectionKey: string;
  firstSeenOrder: number;
}

/** The list is the single future source of truth for chat and drag reordering. */
export interface CustomSectionOrder {
  orderedSectionKeys: readonly string[];
}

export function initialCustomSectionOrder(
  sections: readonly ImportedCustomSection[],
): CustomSectionOrder {
  const unique = new Map<string, number>();
  for (const section of sections) {
    validateSection(section);
    const previous = unique.get(section.sectionKey);
    if (previous === undefined || section.firstSeenOrder < previous) {
      unique.set(section.sectionKey, section.firstSeenOrder);
    }
  }
  return {
    orderedSectionKeys: [...unique.entries()]
      .sort(([leftKey, leftOrder], [rightKey, rightOrder]) =>
        leftOrder - rightOrder || leftKey.localeCompare(rightKey),
      )
      .map(([sectionKey]) => sectionKey),
  };
}

export function reorderCustomSections(
  current: CustomSectionOrder,
  orderedSectionKeys: readonly string[],
): CustomSectionOrder {
  assertSameSectionKeys(current.orderedSectionKeys, orderedSectionKeys);
  return { orderedSectionKeys: [...orderedSectionKeys] };
}

function validateSection(section: ImportedCustomSection): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(section.sectionKey)) {
    throw new Error("自定义 section key 必须是 kebab-case");
  }
  if (!Number.isSafeInteger(section.firstSeenOrder) || section.firstSeenOrder < 0) {
    throw new Error("自定义 section 的首次出现顺序无效");
  }
}

function assertSameSectionKeys(
  current: readonly string[],
  requested: readonly string[],
): void {
  if (new Set(requested).size !== requested.length || requested.length !== current.length) {
    throw new Error("自定义 section 排序必须恰好包含每个现有 section 一次");
  }
  const currentKeys = new Set(current);
  if (requested.some((sectionKey) => !currentKeys.has(sectionKey))) {
    throw new Error("自定义 section 排序包含未知 section");
  }
}
