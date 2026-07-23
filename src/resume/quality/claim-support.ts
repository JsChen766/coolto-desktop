import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import type { ResumeQualityIssue } from "./types.js";

const RESPONSIBILITY_MARKERS = ["主导", "牵头", "全权负责", "独立负责"];
const ENGLISH_RESPONSIBILITY_MARKERS = ["led", "owned", "spearheaded"];

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
      return normalized.length >= 2 && bullet.includes(normalized) && !source.includes(normalized);
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
