import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SelectedFileRegistry } from "../src/files/selected-file-registry.js";
import { ExperienceMaterialIngestionStore } from
  "../src/experience/material-ingestion-store.js";
import { parseSelectedMaterialDocument } from
  "../src/files/parse-selected-file.js";
import type {
  ExperienceMaterialCommitInput,
  ExperienceMaterialCommitter,
} from "../src/experience/material-ingestion-types.js";
import { createExperienceMaterialTools } from
  "../src/tools/experience-material-tools.js";
import { createMultiPageTextPdf } from "./support/material-pdf-fixture.js";

test("material ingestion rejects missing numbers and outputs before one final commit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-material-"));
  try {
    const path = join(directory, "strategy.txt");
    const source = [
      "完成一份 10 页行业研究报告，覆盖 15 家公司和 3 个市场。",
      "使用 DCF 模型建立 5 年期预测，并输出投资建议。",
    ].join("\n");
    await writeFile(path, source, "utf8");
    const files = new SelectedFileRegistry();
    const [selected] = await files.registerPaths([path]);
    const committer = new MemoryCommitter();
    const store = new ExperienceMaterialIngestionStore(files, committer);
    const started = await store.begin({ kind: "file", fileId: selected!.id }, {
      kind: "existing", experienceId: "experience-1",
    });

    const rejected = await store.record({
      sessionId: started.sessionId,
      chunkId: started.chunk.chunkId,
      detailedText: "完成行业研究报告。",
      coveredCriticalTexts: [],
    });
    assert.equal(rejected.accepted, false);
    if (rejected.accepted) return;
    assert.deepEqual(rejected.missingNumbers.sort(), ["10 页", "15 家", "3 个", "5 年", "一份"]);
    assert.ok(rejected.missingCriticalTexts.length >= 2);
    assert.equal(rejected.minimumDetailChars, source.length);
    assert.equal(committer.inputs.length, 0);

    const claimed = await store.record({
      sessionId: started.sessionId,
      chunkId: started.chunk.chunkId,
      detailedText: "一份 10 页 15 家 3 个 5 年 报告模型建议完成输出".padEnd(source.length, "补"),
      coveredCriticalTexts: started.chunk.criticalTexts,
    });
    assert.equal(claimed.accepted, false);
    if (!claimed.accepted) assert.ok(claimed.missingCriticalTexts.length >= 2);

    const completed = await store.record({
      sessionId: started.sessionId,
      chunkId: started.chunk.chunkId,
      detailedText: source,
      coveredCriticalTexts: started.chunk.criticalTexts,
    });
    assert.equal(completed.accepted, true);
    if (!completed.accepted || !completed.done) return;
    assert.equal(completed.result.experienceId, "experience-1");
    assert.equal(committer.inputs.length, 1);
    assert.equal(committer.inputs[0]?.sections.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("long text material is chunked without the old 80k silent truncation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-long-material-"));
  try {
    const path = join(directory, "long-report.txt");
    const source = `${"完整研究过程与关键产出。".repeat(8_000)}数字结果 12345。`;
    await writeFile(path, source, "utf8");
    const files = new SelectedFileRegistry();
    const [selected] = await files.registerPaths([path]);
    const document = await parseSelectedMaterialDocument(await files.read(selected!.id));

    assert.equal(document.truncated, false);
    assert.equal(document.charCount, source.length);
    assert.ok(document.chunks.length > 10);
    assert.equal(document.chunks.map((chunk) => chunk.text).join(""), source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a ten-page report preserves every page and commits only after all pages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-ten-page-"));
  try {
    const pages = Array.from({ length: 10 }, (_, index) =>
      `Page ${index + 1} completed market analysis report covering ${index + 11} companies and delivered ${index + 1} valuation models.`,
    );
    const path = join(directory, "ten-page-report.pdf");
    await writeFile(path, createMultiPageTextPdf(pages));
    const files = new SelectedFileRegistry();
    const [selected] = await files.registerPaths([path]);
    const committer = new MemoryCommitter();
    const store = new ExperienceMaterialIngestionStore(files, committer);
    let current = await store.begin({ kind: "file", fileId: selected!.id }, {
      kind: "existing", experienceId: "experience-report",
    });
    assert.equal(current.chunk.total, 10);
    assert.equal(current.chunk.label, "第 1 页");
    for (let index = 0; index < 10; index += 1) {
      const recorded = await store.record({
        sessionId: current.sessionId, chunkId: current.chunk.chunkId,
        detailedText: current.chunk.text,
        coveredCriticalTexts: current.chunk.criticalTexts,
      });
      assert.equal(committer.inputs.length, index === 9 ? 1 : 0);
      if (recorded.accepted && !recorded.done) {
        current = { sessionId: current.sessionId, chunk: recorded.chunk };
      } else if (index < 9) {
        assert.fail(`page ${index + 1} did not advance`);
      }
    }
    assert.deepEqual(
      committer.inputs[0]?.sections.map((section) => section.label),
      pages.map((_, index) => `第 ${index + 1} 页`),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("current browser page enters the same chunked ingestion flow", async () => {
  const committer = new MemoryCommitter();
  const store = new ExperienceMaterialIngestionStore(
    new SelectedFileRegistry(),
    committer,
    { readActivePage: async () => ({
      url: "https://example.com/report", title: "项目报告",
      metaDescription: "", ogTitle: "", ogDescription: "",
      text: "完成市场分析报告，覆盖 8 个国家并输出增长方案。",
      textTruncated: false, formFields: [],
    }) },
  );
  const started = await store.begin({ kind: "web" }, {
    kind: "existing", experienceId: "experience-web",
  });
  assert.equal(started.chunk.label, "网页正文");
  assert.deepEqual(started.chunk.numbers, ["8 个"]);
  assert.ok(started.chunk.criticalTexts.length > 0);
});

test("the current user message can be ingested without a file", async () => {
  const store = new ExperienceMaterialIngestionStore(
    new SelectedFileRegistry(), new MemoryCommitter(), undefined,
    () => "完成产品方案并覆盖 12 个用户场景。",
  );
  const started = await store.begin({
    kind: "text", selectedTexts: ["完成产品方案并覆盖 12 个用户场景。"],
  }, {
    kind: "new", category: "project", title: "产品方案",
    organization: null, role: null, location: null,
    startDate: null, endDate: null, tags: ["产品"],
  });
  assert.equal(started.chunk.label, "所选原文片段 1");
  assert.deepEqual(started.chunk.numbers, ["12 个"]);
});

test("multi-experience material accepts only host-verified source excerpts", async () => {
  const fullText = "操作：请帮我沉淀。\n经历甲完成 8 页报告。\n经历乙交付 3 个模型。";
  const store = new ExperienceMaterialIngestionStore(
    new SelectedFileRegistry(), new MemoryCommitter(), undefined, () => fullText,
  );
  const started = await store.begin({
    kind: "text", selectedTexts: ["经历乙交付 3 个模型。"],
  }, { kind: "existing", experienceId: "experience-b" });
  assert.equal(started.chunk.text, "经历乙交付 3 个模型。");
  assert.deepEqual(started.chunk.numbers, ["3 个"]);
  await assert.rejects(
    store.begin({ kind: "text", selectedTexts: ["经历丙完成 20 个项目。"] },
      { kind: "existing", experienceId: "experience-c" }),
    /不在固定的原始材料/u,
  );
});

test("direct text cannot write chat instructions without a verified excerpt", async () => {
  const store = new ExperienceMaterialIngestionStore(
    new SelectedFileRegistry(), new MemoryCommitter(), undefined,
    () => "请沉淀这段经历：完成 6 页分析报告。",
  );
  await assert.rejects(
    store.begin({ kind: "text", selectedTexts: [] },
      { kind: "existing", experienceId: "experience-a" }),
    /必须选择.*经历原文片段/u,
  );
});

test("missing direct-text selection is a recoverable tool receipt", async () => {
  const store = new ExperienceMaterialIngestionStore(
    new SelectedFileRegistry(), new MemoryCommitter(), undefined,
    () => "请沉淀：完成 6 页分析报告。",
  );
  const [begin] = createExperienceMaterialTools({
    store,
    experiences: {
      searchExperiences: async () => ({ items: [], nextCursor: null }),
      getExperience: async () => { throw new Error("should not read"); },
    },
  });
  const result = await begin!.execute("missing-selection", {
    source: { kind: "text" },
    target: { kind: "existing", experienceId: "experience-a" },
  });
  assert.equal((result.details as { accepted: boolean }).accepted, false);
  assert.equal(
    (result.details as { errorCode: string }).errorCode,
    "selected_text_required",
  );
});

class MemoryCommitter implements ExperienceMaterialCommitter {
  inputs: ExperienceMaterialCommitInput[] = [];
  async commit(input: ExperienceMaterialCommitInput) {
    this.inputs.push(structuredClone(input));
    return {
      experienceId: input.target.kind === "existing"
        ? input.target.experienceId : "created-experience",
      title: input.target.kind === "new" ? input.target.title : "战略投资实习生",
      created: input.target.kind === "new", duplicate: false,
      addedCharacters: input.sections.reduce((sum, item) => sum + item.text.length, 0),
      sectionCount: input.sections.length,
      numberCount: input.numberCount,
      criticalOutputCount: input.criticalOutputCount,
    };
  }
}
