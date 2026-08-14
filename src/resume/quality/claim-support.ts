import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import type { ResumeQualityIssue } from "./types.js";

const RESPONSIBILITY_MARKERS = ["主导", "牵头", "全权负责", "独立负责"];
const ENGLISH_RESPONSIBILITY_MARKERS = ["led", "owned", "spearheaded"];

/**
 * Cross-language term groups: a Chinese tag ("半导体") and its English
 * spellings ("semiconductor", "semi-conductor") are the same term. Claims
 * written in one language verify against evidence written in the other,
 * instead of mis-reporting a translation as unsupported.
 */
const TECHNOLOGY_TERM_GROUPS: readonly (readonly string[])[] = [
  ["半导体", "semiconductor", "semi-conductor"],
  ["半导体设备", "semiconductor equipment"],
  ["光伏", "photovoltaic"],
  ["锂电", "lithium"],
  ["加密资产", "加密", "crypto", "cryptocurrency", "digital asset"],
  ["人工智能", "artificial intelligence", "ai"],
  ["机器人", "robot"],
  ["智能汽车", "smart car", "intelligent vehicle", "ev"],
  ["大模型", "large language model", "llm"],
  ["芯片", "chip"],
  ["量化", "quantitative"],
  ["财务建模", "financial model", "financial modeling", "financial modelling"],
  ["尽职调查", "尽调", "due diligence"],
  ["一级市场", "primary market", "private market"],
  ["投资银行", "投行", "investment bank"],
  ["股票研究", "equity research"],
  ["稳定币", "stablecoin"],
];

export function findUnsupportedClaims(
  snapshot: ResumeSourceSnapshot,
  bindings: readonly BulletEvidenceBinding[],
): ResumeQualityIssue[] {
  const experienceById = new Map(
    snapshot.experiences.map((experience) => [experience.id, experience]),
  );
  const allTags = new Set(
    snapshot.experiences.flatMap((experience) => [...experience.tags]),
  );
  return bindings.flatMap((binding) => {
    const experience = experienceById.get(binding.sourceExperienceId);
    if (!experience) return [];
    const source = `${experience.content} ${experience.tags.join(" ")}`.toLocaleLowerCase();
    const bullet = binding.bulletText.toLocaleLowerCase();
    const issues: ResumeQualityIssue[] = [];
    const unsupportedChinese = RESPONSIBILITY_MARKERS.find(
      (marker) => bullet.includes(marker) && !source.includes(marker),
    );
    const unsupportedEnglish = ENGLISH_RESPONSIBILITY_MARKERS.find(
      (marker) => hasWord(bullet, marker) && !hasWord(source, marker),
    );
    const unsupportedMarker = unsupportedChinese ?? unsupportedEnglish;
    if (unsupportedMarker) {
      issues.push({
        code: "unsupported_responsibility_claim",
        message: `Bullet ${binding.bulletId} upgrades responsibility with unsupported wording: ${unsupportedMarker}.`,
        repairable: true,
        priority: 1,
        bulletIds: [binding.bulletId],
      });
    }
    const unsupportedTag = [...allTags].find((tag) => {
      const normalized = tag.trim().toLocaleLowerCase();
      return (
        normalized.length >= 2 &&
        termInText(bullet, normalized) &&
        !termInText(source, normalized)
      );
    });
    if (unsupportedTag) {
      issues.push({
        code: "unsupported_technology_claim",
        message: `Bullet ${binding.bulletId} cites technology ${unsupportedTag} outside its source experience.`,
        repairable: true,
        priority: 1,
        bulletIds: [binding.bulletId],
      });
    }
    return issues;
  });
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, "u").test(text);
}

/**
 * Whether `term` (a technology tag in either language) appears in `text`,
 * matching across the term's language group. Chinese variants use plain
 * substring matching; English variants normalize dashes/spaces so
 * "semi-conductor" and "semiconductor" are the same word, and very short
 * English abbreviations (ai, ev) match on word boundaries only.
 */
function termInText(text: string, term: string): boolean {
  const group = TECHNOLOGY_TERM_GROUPS.find((variants) =>
    variants.includes(term),
  );
  const variants = group ?? [term];
  const normalizedText = text.toLocaleLowerCase().replace(/[-_\s]+/g, "");
  return variants.some((variant) => {
    const v = variant.toLocaleLowerCase();
    if (/^[a-z]{1,2}$/.test(v)) {
      return hasWord(text, v);
    }
    return normalizedText.includes(v.replace(/[-_\s]+/g, ""));
  });
}
