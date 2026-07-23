import type { ResumeTemplateManifestEntry } from "./template";

export interface FontReadiness {
  ready: boolean;
  loadedFamilies: string[];
}

export async function waitForResumeFonts(
  page: HTMLElement,
  template: ResumeTemplateManifestEntry,
): Promise<FontReadiness> {
  await document.fonts.ready;
  const text = page.textContent ?? "";
  const scripts = [
    {
      family: template.fonts.chinese.family,
      sample: "中文简历",
      used: /[\u3400-\u9fff\uf900-\ufaff]/u.test(text),
    },
    {
      family: template.fonts.english.family,
      sample: "English resume 2026",
      used: /[A-Za-z0-9]/u.test(text),
    },
  ].filter((script) => script.used);
  if (!scripts.length) {
    scripts.push({
      family: template.fonts.english.family,
      sample: "English resume 2026",
      used: true,
    });
  }
  const styles = Array.from(
    new Set([
      `${template.styles.body.font_weight} ${template.styles.body.font_size_pt}pt`,
      `${template.styles.name.font_weight} ${template.styles.name.font_size_pt}pt`,
      `${template.styles.section_heading.font_weight} ${template.styles.section_heading.font_size_pt}pt`,
    ]),
  );
  const requests = styles.flatMap((style) =>
    scripts.map((script) => ({
      specification: `${style} "${script.family}"`,
      sample: script.sample,
    })),
  );
  await Promise.all(
    requests.map((request) =>
      document.fonts.load(request.specification, request.sample),
    ),
  );
  const ready = requests.every((request) =>
    document.fonts.check(request.specification, request.sample),
  );
  return {
    ready,
    loadedFamilies: ready ? scripts.map((script) => script.family) : [],
  };
}
