import type { WebContents } from "electron";

import { MatchReportStore } from "../../match/report-store.js";
import { scoreToTier } from "../../match/scorer.js";
import { presentMatchScore } from "../../match/score-trust.js";
import type { DesktopAgentEvent, MatchReportArtifactData } from "../shared/types.js";

export function createMatchEmitter(
  target: WebContents,
  store: MatchReportStore,
): (conversationId: string) => void {
  return (conversationId: string) => {
    const entry = store.getLatest();
    if (!entry || target.isDestroyed()) return;

    const { report, jdTitle, jdCompany } = entry;
    const presentation = presentMatchScore(
      report.finalScore,
      report.evidenceCompleteness,
    );
    const data: MatchReportArtifactData = {
      reportId: report.id,
      jdId: report.jd.jdId,
      jdTitle,
      jdCompany,
      finalScore: report.finalScore,
      tier: scoreToTier(report.finalScore),
      dimensions: report.dimensions,
      highlights: report.highlights,
      gaps: report.gaps,
      coverageRatio: report.coverageRatio,
      evidenceCompleteness: report.evidenceCompleteness,
      scoreConfidence: presentation.confidence,
      displayScore: presentation.displayScore,
      modelId: report.meta.modelId,
      scorerVersion: report.meta.scorerVersion,
      generatedAt: report.meta.generatedAt,
      expired: report.expired,
    };

    target.send("agent:event", {
      conversationId,
      event: {
        type: "match.report.created",
        data,
      } satisfies DesktopAgentEvent,
    });
  };
}
