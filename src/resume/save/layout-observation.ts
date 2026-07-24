import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeBrowserLayoutObservation } from "./types.js";

export const RESUME_PUBLICATION_CLIENT_BUILD = "coolto-desktop-g5-v1";

export function toBrowserLayoutObservation(
  result: ResumeCompileResult,
  proposalId: string,
): ResumeBrowserLayoutObservation {
  return {
    run_id: null,
    surface: "review",
    measurement_version: "browser-layout-observation-v1",
    template_id: result.templateId,
    profile_version: result.profileVersion,
    profile_hash: result.profileHash,
    fonts_ready: result.fontsReady,
    loaded_font_families: [...result.loadedFontFamilies],
    page_count: result.pageCount,
    overflow_px: result.overflowPx,
    used_height_px: result.usedHeightPx,
    available_height_px: result.availableHeightPx,
    viewport: {
      width_px: result.viewport.widthPx,
      height_px: result.viewport.heightPx,
      device_pixel_ratio: result.viewport.devicePixelRatio,
    },
    page_metrics: [],
    bullets: result.bullets.map((bullet) => ({
      bullet_id: bullet.bulletId,
      line_count: bullet.lineCount,
      last_line_width_px: bullet.lastLineWidthPx,
      available_line_width_px: bullet.availableLineWidthPx,
    })),
    client_build: RESUME_PUBLICATION_CLIENT_BUILD,
    observed_at: result.observedAt,
    idempotency_key: `${proposalId}:layout`,
  };
}
