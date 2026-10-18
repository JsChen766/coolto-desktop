import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileTemplate, parse } from "@vue/compiler-sfc";

async function compileTemplateFile(path: string): Promise<string> {
  const source = await readFile(path, "utf8");
  const parsed = parse(source, { filename: path });
  assert.equal(parsed.errors.length, 0);
  const compiled = compileTemplate({ id: path, source: parsed.descriptor.template?.content ?? "", filename: path });
  assert.deepEqual(compiled.errors, []);
  return compiled.code;
}

test("material library component and workspace branch compile as reachable views", async () => {
  const library = await compileTemplateFile("src/desktop/renderer/src/material/MaterialLibraryView.vue");
  const workspace = await compileTemplateFile("src/desktop/renderer/src/app/AppMainWorkspace.vue");
  assert.match(library, /material-library-view/u);
  assert.match(workspace, /activeView === 'material'/u);
});

test("material library submits its query to the host rather than filtering catalog metadata locally", async () => {
  const source = await readFile("src/desktop/renderer/src/material/MaterialLibraryView.vue", "utf8");
  assert.match(source, /options\.query = normalizedQuery/u);
  assert.match(source, /api\.value\.list\(options\)/u);
  assert.doesNotMatch(source, /const filtered = computed/u);
});

test("material relation recovery state remains visible and cannot repeat a host write", async () => {
  const source = await readFile("src/desktop/renderer/src/material/MaterialRelationProposal.vue", "utf8");
  assert.match(source, /needs_user_decision/u);
  assert.match(source, /busy \|\| !canDecide/u);
});

test("§10 material library UI surfaces processing status, OCR confirm, relations, and delete impact", async () => {
  const list = await readFile("src/desktop/renderer/src/material/MaterialLibraryList.vue", "utf8");
  assert.match(list, /等待 OCR/u);
  assert.match(list, /处理中/u);
  assert.match(list, /待确认/u);
  assert.match(list, /未归类/u);

  const filter = await readFile("src/desktop/renderer/src/material/MaterialLibraryStatusFilter.vue", "utf8");
  assert.match(filter, /value: "unclassified"/u);
  assert.match(filter, /value: "queued"/u);
  assert.match(filter, /value: "processing"/u);
  assert.match(filter, /value: "needs_confirmation"/u);

  const detail = await readFile("src/desktop/renderer/src/material/MaterialDetailPanel.vue", "utf8");
  assert.match(detail, /relatedExperienceIds/u);
  assert.match(detail, /关联经历/u);
  assert.match(detail, /MaterialOcrReview/u);
  assert.match(detail, /MaterialRelationComposer/u);

  const ocr = await readFile("src/desktop/renderer/src/material/MaterialOcrReview.vue", "utf8");
  assert.match(ocr, /OCR 需要确认/u);
  assert.match(ocr, /低置信片段在确认前不会作为可靠事实/u);
  assert.match(ocr, /needsUserConfirmation/u);
  assert.match(ocr, /ocrConfidence/u);

  const impact = await readFile("src/desktop/renderer/src/material/MaterialImpactPreview.vue", "utf8");
  assert.match(impact, /确认删除本地材料/u);
  assert.match(impact, /affectedExperiences/u);
  assert.match(impact, /条引用/u);
  assert.match(impact, /不会修改已发布的简历/u);

  const dialogs = await readFile("src/desktop/main/material/material-file-dialogs.ts", "utf8");
  assert.match(dialogs, /"pdf", "docx", "txt", "md", "markdown", "png", "jpg", "jpeg"/u);
  assert.doesNotMatch(dialogs, /webp/u);
});
