import { watch, type Ref } from "vue";

import type { ResumeDraftDetail } from "@desktop/types";
import { RESUME_LAYOUT_TOLERANCE_PX } from "../../../../resume/compiler-types";
import {
  maximumSafeResumeLineSpacingPercent,
  scaledResumeBodyLineHeight,
} from "../../../../resume/layout-line-spacing";
import { measureResumePageGeometry } from "../resume-renderer/dom-measurement";
import type { ResumeTemplateManifestEntry } from "../resume-renderer/template";

export function useResumeLineSpacingPreview(input: {
  root: Ref<HTMLElement | undefined>;
  draft: () => ResumeDraftDetail;
  percent: () => number;
  onMaximum: (value: number) => void;
}) {
  let template: ResumeTemplateManifestEntry | undefined;

  watch(input.percent, () => apply());

  function setTemplate(value: ResumeTemplateManifestEntry): void {
    template = value;
  }

  function apply(): void {
    const frame = input.root.value?.querySelector<HTMLElement>(
      ".resume-document-frame",
    );
    if (!frame || !template) return;
    frame.style.setProperty(
      "--resume-body-line-height",
      String(scaledResumeBodyLineHeight(
        template.styles.body.line_height,
        input.percent(),
      )),
    );
  }

  function refreshMaximum(): void {
    const frame = input.root.value?.querySelector<HTMLElement>(
      ".resume-document-frame",
    );
    const page = frame?.querySelector<HTMLElement>(".resume-document-page");
    if (!frame || !page || !template) return;
    const maximum = maximumSafeResumeLineSpacingPercent({
      maximumUsageRatio:
        input.draft().compileResult.effectiveTargetBand.maximum,
      layoutTolerancePx: RESUME_LAYOUT_TOLERANCE_PX,
      measure: (percent) => {
        frame.style.setProperty(
          "--resume-body-line-height",
          String(scaledResumeBodyLineHeight(
            template!.styles.body.line_height,
            percent,
          )),
        );
        return measureResumePageGeometry(page);
      },
    });
    apply();
    input.onMaximum(maximum);
  }

  return { setTemplate, apply, refreshMaximum };
}
