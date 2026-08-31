import manifestJson from "../resume/template/resume-layout-templates-v1.json";

import type {
  ResumeLayoutTargetBand,
  ResumeLayoutTuning,
  ResumeStructure,
  ResumeTemplateId,
} from "../../../../resume/types";
import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
} from "../../../../resume/compiler-types";
import {
  RESUME_LINE_SPACING_MAX_PERCENT,
  RESUME_LINE_SPACING_MIN_PERCENT,
  scaledResumeBodyLineHeight,
} from "../../../../resume/layout-line-spacing";

export interface ResumeTemplateManifestEntry {
  template_id: ResumeTemplateId;
  profile_version: string;
  profile_hash: string;
  page: { width_mm: number; height_mm: number; orientation: "portrait" };
  padding_mm: { top: number; right: number; bottom: number; left: number };
  content: { width_mm: number; height_mm: number };
  fonts: Record<
    "chinese" | "english",
    { family: string; file_id: string; checksum_sha256: string }
  >;
  styles: Record<
    | "body"
    | "name"
    | "contact"
    | "section_heading"
    | "item_heading"
    | "item_subheading"
    | "date",
    {
      font_size_pt: number;
      font_weight: number;
      line_height: number;
      italic: boolean;
    }
  >;
  spacing_mm: {
    header_after_mm: number;
    section_before_mm: number;
    section_after_mm: number;
    item_after_mm: number;
    raw_text_before_mm: number;
    bullet_before_mm: number;
    bullet_after_mm: number;
    heading_border_mm: number;
  };
  bullet: {
    marker_width_mm: number;
    indent_mm: number;
    gap_mm: number;
    target_ratio: number;
    gate_ratio: number;
  };
  pagination: {
    keep_section_heading_with_first_item: boolean;
    avoid_item_break_inside: boolean;
    orphans: number;
    widows: number;
  };
  density: ResumeLayoutTargetBand;
}

interface ResumeTemplateManifest {
  schema_version: "resume-layout-templates-v1";
  templates: ResumeTemplateManifestEntry[];
}

const manifest = manifestJson as ResumeTemplateManifest;

if (manifest.schema_version !== "resume-layout-templates-v1") {
  throw new Error(`Unsupported resume template manifest: ${manifest.schema_version}`);
}

export const RESUME_TEMPLATE_MANIFEST = manifest;

export function requireResumeTemplate(
  templateId: ResumeTemplateId,
): ResumeTemplateManifestEntry {
  const template = manifest.templates.find(
    (candidate) => candidate.template_id === templateId,
  );
  if (!template) {
    throw new Error(`Resume template is missing from manifest: ${templateId}`);
  }
  return template;
}

export function resolveResumeTemplate(
  structure: ResumeStructure,
): ResumeTemplateManifestEntry | undefined {
  const exactProfile = manifest.templates.find(
    (candidate) =>
      candidate.profile_version === structure.layout_profile_version &&
      candidate.profile_hash === structure.layout_profile_hash,
  );
  const requested = structure.layout_template_id
    ? manifest.templates.find(
        (candidate) => candidate.template_id === structure.layout_template_id,
      )
    : exactProfile;
  if (
    !requested ||
    requested.profile_version !== structure.layout_profile_version ||
    requested.profile_hash !== structure.layout_profile_hash
  ) {
    return undefined;
  }
  return requested;
}

function clamp(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.min(
    maximum,
    Math.max(minimum, Number.isFinite(value) ? Number(value) : fallback),
  );
}

export function effectiveTargetBand(
  template: ResumeTemplateManifestEntry,
  requested?: ResumeLayoutTargetBand,
): ResumeLayoutTargetBand {
  const valid =
    requested &&
    Number.isFinite(requested.minimum) &&
    Number.isFinite(requested.target) &&
    Number.isFinite(requested.maximum) &&
    requested.minimum >= 0 &&
    requested.minimum <= requested.target &&
    requested.target <= requested.maximum &&
    requested.maximum <= 1;
  const source = valid ? requested : template.density;
  const minimum = Math.max(RESUME_GLOBAL_MINIMUM_USAGE_RATIO, source.minimum);
  const maximum = source.maximum;
  return {
    minimum,
    target: Math.min(
      maximum,
      Math.max(minimum, source.target, RESUME_DEFAULT_TARGET_USAGE_RATIO),
    ),
    maximum,
  };
}

export function applyResumeTemplateStyle(
  element: HTMLElement,
  template: ResumeTemplateManifestEntry,
  tuning?: ResumeLayoutTuning,
): void {
  const bodyScale = clamp(tuning?.body_font_scale, 1, 1.08, 1);
  const lineHeight = clamp(
    tuning?.body_line_height,
    scaledResumeBodyLineHeight(
      template.styles.body.line_height,
      RESUME_LINE_SPACING_MIN_PERCENT,
    ),
    scaledResumeBodyLineHeight(
      template.styles.body.line_height,
      RESUME_LINE_SPACING_MAX_PERCENT,
    ),
    template.styles.body.line_height,
  );
  const sectionScale = clamp(tuning?.section_gap_scale, 1, 2.5, 1);
  const itemScale = clamp(tuning?.item_gap_scale, 1, 4, 1);
  const bulletScale = clamp(tuning?.bullet_gap_scale, 1, 3, 1);
  const variables: Record<string, string> = {
    "--resume-page-width": `${template.page.width_mm}mm`,
    "--resume-page-height": `${template.page.height_mm}mm`,
    "--resume-padding-top": `${template.padding_mm.top}mm`,
    "--resume-padding-right": `${template.padding_mm.right}mm`,
    "--resume-padding-bottom": `${template.padding_mm.bottom}mm`,
    "--resume-padding-left": `${template.padding_mm.left}mm`,
    "--resume-content-width": `${template.content.width_mm}mm`,
    "--resume-content-height": `${template.content.height_mm}mm`,
    "--resume-body-font-size": `${template.styles.body.font_size_pt * bodyScale}pt`,
    "--resume-body-font-weight": String(template.styles.body.font_weight),
    "--resume-body-line-height": String(lineHeight),
    "--resume-name-font-size": `${template.styles.name.font_size_pt}pt`,
    "--resume-name-font-weight": String(template.styles.name.font_weight),
    "--resume-name-line-height": String(template.styles.name.line_height),
    "--resume-contact-font-size": `${template.styles.contact.font_size_pt}pt`,
    "--resume-contact-font-weight": String(template.styles.contact.font_weight),
    "--resume-contact-line-height": String(template.styles.contact.line_height),
    "--resume-section-font-size": `${template.styles.section_heading.font_size_pt}pt`,
    "--resume-section-font-weight": String(template.styles.section_heading.font_weight),
    "--resume-section-line-height": String(template.styles.section_heading.line_height),
    "--resume-item-font-size": `${template.styles.item_heading.font_size_pt}pt`,
    "--resume-item-font-weight": String(template.styles.item_heading.font_weight),
    "--resume-item-line-height": String(template.styles.item_heading.line_height),
    "--resume-subheading-font-size": `${template.styles.item_subheading.font_size_pt}pt`,
    "--resume-subheading-font-weight": String(
      template.styles.item_subheading.font_weight,
    ),
    "--resume-subheading-line-height": String(
      template.styles.item_subheading.line_height,
    ),
    "--resume-subheading-font-style": template.styles.item_subheading.italic
      ? "italic"
      : "normal",
    "--resume-date-font-size": `${template.styles.date.font_size_pt}pt`,
    "--resume-date-font-weight": String(template.styles.date.font_weight),
    "--resume-date-line-height": String(template.styles.date.line_height),
    "--resume-header-after": `${template.spacing_mm.header_after_mm}mm`,
    "--resume-contact-gap": `${template.spacing_mm.header_after_mm}mm`,
    "--resume-entry-gap": `${template.spacing_mm.header_after_mm}mm`,
    "--resume-section-before": `${template.spacing_mm.section_before_mm * sectionScale}mm`,
    "--resume-section-after": `${template.spacing_mm.section_after_mm * sectionScale}mm`,
    "--resume-item-after": `${template.spacing_mm.item_after_mm * itemScale}mm`,
    "--resume-raw-text-before": `${template.spacing_mm.raw_text_before_mm}mm`,
    "--resume-bullet-before": `${template.spacing_mm.bullet_before_mm * bulletScale}mm`,
    "--resume-bullet-after": `${template.spacing_mm.bullet_after_mm}mm`,
    "--resume-bullet-gap": `${template.bullet.gap_mm}mm`,
    "--resume-bullet-marker-width": `${template.bullet.marker_width_mm}mm`,
    "--resume-bullet-indent": `${template.bullet.indent_mm}mm`,
    "--resume-heading-border": `${template.spacing_mm.heading_border_mm}mm`,
  };
  for (const [name, value] of Object.entries(variables)) {
    element.style.setProperty(name, value);
  }
}
