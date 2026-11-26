import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ExperienceMaterialIngestionStore } from
  "../src/experience/material-ingestion-store.js";
import type {
  ExperienceMaterialCommitInput,
  ExperienceMaterialCommitter,
} from "../src/experience/material-ingestion-types.js";
import { parseSelectedMaterialDocument } from "../src/files/parse-selected-file.js";
import { SelectedFileRegistry } from "../src/files/selected-file-registry.js";
import type { SupportedImportFileType } from "../src/files/types.js";

const paragraphs = Array.from({ length: 20 }, (_, index) =>
  `第 ${index + 1} 段：负责增长项目，转化率提升 ${index + 30}%，覆盖 ${1200 + index} 名用户。`
    .repeat(18));

function selected(content: Buffer, type: SupportedImportFileType = "text") {
  const filename = type === "markdown" ? "experience.md" : "experience.txt";
  return {
    metadata: { id: `file-${filename}`, filename, type, sizeBytes: content.byteLength },
    content,
  };
}

function utf16(text: string, endian: "le" | "be"): Buffer {
  const body = Buffer.from(text, "utf16le");
  if (endian === "le") return Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
  return Buffer.concat([Buffer.from([0xfe, 0xff]), body.swap16()]);
}

test("CRLF text over the chunk limit splits on paragraphs exactly like LF", async () => {
  const lf = paragraphs.join("\n\n");
  const crlf = paragraphs.join("\r\n\r\n");
  assert.ok(lf.length > 12_000);
  for (const type of ["text", "markdown"] as const) {
    const fromLf = await parseSelectedMaterialDocument(selected(Buffer.from(lf, "utf8"), type));
    const fromCrlf = await parseSelectedMaterialDocument(selected(Buffer.from(crlf, "utf8"), type));
    assert.equal(fromCrlf.text, lf);
    assert.equal(fromCrlf.text.includes("\r"), false);
    assert.deepEqual(fromCrlf.chunks, fromLf.chunks);
    assert.ok(fromCrlf.chunks.length > 1);
    for (const chunk of fromCrlf.chunks) {
      assert.equal(chunk.text.includes("\r"), false);
      for (const piece of chunk.text.split("\n\n")) assert.ok(paragraphs.includes(piece));
    }
  }
});

test("lone CR line endings are normalized to LF", async () => {
  const parsed = await parseSelectedMaterialDocument(
    selected(Buffer.from("第一段\r\r第二段\r结尾", "utf8")),
  );
  assert.equal(parsed.text, "第一段\n\n第二段\n结尾");
});

test("UTF-16 files with a BOM decode to the original text", async () => {
  const original = "实习经历：负责增长项目\r\n\r\nConversion +35%，覆盖 1200 名用户。";
  const expected = original.replace(/\r\n/gu, "\n");
  for (const endian of ["le", "be"] as const) {
    const parsed = await parseSelectedMaterialDocument(selected(utf16(original, endian)));
    assert.equal(parsed.text, expected, `utf-16${endian}`);
    assert.equal(parsed.text.includes("\u0000"), false);
    assert.equal(parsed.text.includes("ÿþ"), false);
    assert.equal(parsed.text.includes("þÿ"), false);
    assert.equal(parsed.text.includes("﻿"), false);
  }
});

test("UTF-8 with a BOM and GB18030 text still decode", async () => {
  const utf8Bom = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("带 BOM 的经历\r\n第二行", "utf8"),
  ]);
  const fromBom = await parseSelectedMaterialDocument(selected(utf8Bom));
  assert.equal(fromBom.text, "带 BOM 的经历\n第二行");

  // "中文简历\r\n\r\n经历" encoded as GB18030; invalid as UTF-8.
  const gb18030 = Buffer.from([
    0xd6, 0xd0, 0xce, 0xc4, 0xbc, 0xf2, 0xc0, 0xfa, 0x0d, 0x0a, 0x0d, 0x0a, 0xbe, 0xad, 0xc0, 0xfa,
  ]);
  const fromGb = await parseSelectedMaterialDocument(selected(gb18030));
  assert.equal(fromGb.text, "中文简历\n\n经历");
});

test("BOM-less UTF-16 or binary content with NUL is rejected instead of ingested", async () => {
  const bomless = Buffer.from("Experience text", "utf16le");
  await assert.rejects(
    parseSelectedMaterialDocument(selected(bomless)),
    /无法识别文本文件编码/u,
  );
});

test("CRLF file accepts a multi-paragraph selection quoted with LF", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-crlf-material-"));
  try {
    const path = join(directory, "notepad-experience.txt");
    await writeFile(path, paragraphs.join("\r\n\r\n"), "utf8");
    const files = new SelectedFileRegistry();
    const [file] = await files.registerPaths([path]);
    const committer = new MemoryCommitter();
    const store = new ExperienceMaterialIngestionStore(files, committer);
    const selection = `${paragraphs[2]}\n\n${paragraphs[3]}`;

    const started = await store.begin(
      { kind: "file", fileId: file!.id, selectedTexts: [selection] },
      { kind: "existing", experienceId: "experience-1" },
    );
    assert.equal(started.chunk.text, selection);
    assert.equal(started.chunk.total, 1);

    const whole = await store.begin(
      { kind: "file", fileId: file!.id },
      { kind: "existing", experienceId: "experience-1" },
    );
    assert.ok(whole.chunk.total > 1);
    assert.equal(whole.chunk.text.includes("\r"), false);
    for (const piece of whole.chunk.text.split("\n\n")) assert.ok(paragraphs.includes(piece));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

class MemoryCommitter implements ExperienceMaterialCommitter {
  inputs: ExperienceMaterialCommitInput[] = [];
  async commit(input: ExperienceMaterialCommitInput) {
    this.inputs.push(structuredClone(input));
    return {
      experienceId: "experience-1", title: "增长实习", created: false, duplicate: false,
      addedCharacters: input.sections.reduce((sum, item) => sum + item.text.length, 0),
      sectionCount: input.sections.length,
      numberCount: input.numberCount,
      criticalOutputCount: input.criticalOutputCount,
    };
  }
}
