import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(name: string): Promise<string> {
  return readFile(
    new URL(`../src/desktop/renderer/src/${name}`, import.meta.url),
    "utf8",
  );
}

test("Match card and panel state score is relative reference not hiring probability", async () => {
  const [card, panel, i18n] = await Promise.all([
    source("components/MatchReportCard.vue"),
    source("components/MatchReportPanel.vue"),
    source("i18n/catalog-resume-agent.ts"),
  ]);
  assert.match(card, /相对参考，非录用概率/u);
  assert.match(panel, /相对参考，非录用概率/u);
  assert.match(i18n, /相对参考，非录用概率/u);
  assert.match(i18n, /not a hiring probability/iu);
});

test("Match panel surfaces coverage, evidence completeness, model and scorer version", async () => {
  const panel = await source("components/MatchReportPanel.vue");
  assert.match(panel, /覆盖率/u);
  assert.match(panel, /证据完整度/u);
  assert.match(panel, /规则版本/u);
  assert.match(panel, /data\.modelId/u);
  assert.match(panel, /data\.scorerVersion/u);
  assert.match(panel, /data\.coverageRatio/u);
  assert.match(panel, /data\.evidenceCompleteness/u);
});

test("Match UI degrades precision and flags low confidence", async () => {
  const [card, panel] = await Promise.all([
    source("components/MatchReportCard.vue"),
    source("components/MatchReportPanel.vue"),
  ]);
  assert.match(card, /displayScore/u);
  assert.match(card, /信息不足，置信度较低/u);
  assert.match(panel, /displayScore/u);
  assert.match(panel, /scoreConfidence === 'low'/u);
  assert.match(panel, /scoreConfidence === 'medium'/u);
});

test("Match card and panel keep highlight evidence and gap JD requirement text", async () => {
  const panel = await source("components/MatchReportPanel.vue");
  assert.match(panel, /h\.requirementText/u);
  assert.match(panel, /ev\.sourceQuote/u);
  assert.match(panel, /g\.requirementText/u);
  assert.match(panel, /g\.explanation/u);
});
