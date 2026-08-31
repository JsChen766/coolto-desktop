import type { ExperienceReader } from "../../../api/types.js";
import type { DelegationGrantV1 } from "../../../agent-task/grant-types.js";
import type { ApplicationRecord } from "../../../tracker/types.js";

export async function validateBriefSourceRefs(
  application: ApplicationRecord,
  sections: Array<{ sourceRefs: string[] }>,
  grant: DelegationGrantV1,
  experiences: ExperienceReader,
): Promise<void> {
  const refs = [...new Set(sections.flatMap((section) => section.sourceRefs))];
  if (!refs.length || sections.some((section) => !section.sourceRefs.length)) {
    throw new Error("简报每个主题都必须包含来源引用");
  }
  for (const ref of refs) {
    if (ref === `jd:${application.jdId}` || ref === `resume:${application.resumeId}`) {
      continue;
    }
    if (ref.startsWith("experience:") && ref.slice(11)) {
      await experiences.getExperience(ref.slice(11));
      continue;
    }
    if (ref.startsWith("web:") && webSourceAllowed(ref.slice(4), grant)) continue;
    throw new Error(`简报来源不属于当前 Application 或授权站点：${ref}`);
  }
}

function webSourceAllowed(value: string, grant: DelegationGrantV1): boolean {
  if (!grant.allowedActions.includes("browser.read")) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return grant.allowedDomains.some((domain) =>
      host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}
