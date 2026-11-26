import assert from "node:assert/strict";
import test from "node:test";

import { downloadSaveNameParts } from "../src/browser/browser-download-save-name.js";

const MAX_BYTES = 200;

function fullName(input: string): string {
  const { stem, extension } = downloadSaveNameParts(input);
  return `${stem}${extension}`;
}

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

test("short normal names pass through unchanged", () => {
  assert.deepEqual(downloadSaveNameParts("简历 2026.pdf"), { stem: "简历 2026", extension: ".pdf" });
  assert.deepEqual(downloadSaveNameParts("report.tar.gz"), { stem: "report.tar", extension: ".gz" });
  assert.deepEqual(downloadSaveNameParts("README"), { stem: "README", extension: "" });
});

test("long CJK names keep the extension and fit the APFS byte budget", () => {
  const input = `${"申请表".repeat(100)}.docx`;
  assert.ok(bytes(input) > 255, "fixture must exceed the APFS 255-byte name limit");
  const { stem, extension } = downloadSaveNameParts(input);
  assert.equal(extension, ".docx");
  assert.ok(bytes(`${stem}${extension}`) <= MAX_BYTES);
  assert.ok(stem.length > 0 && "申请表".includes(stem.at(-1) ?? ""));
});

test("long ASCII names keep the extension", () => {
  const name = fullName(`${"a".repeat(300)}.pdf`);
  assert.ok(name.endsWith(".pdf"));
  assert.equal(name, `${"a".repeat(MAX_BYTES - 4)}.pdf`);
});

test("emoji at the cut boundary never leaves a lone surrogate", () => {
  for (const prefix of ["", "a", "ab", "abc"]) {
    const { stem, extension } = downloadSaveNameParts(`${prefix}${"😀".repeat(120)}`);
    assert.equal(extension, "");
    assert.ok(stem.isWellFormed(), `prefix=${JSON.stringify(prefix)}`);
    assert.ok(bytes(stem) <= MAX_BYTES);
    assert.ok(bytes(stem) > MAX_BYTES - 4);
  }
});

test("lone surrogates in the input are replaced before measuring bytes", () => {
  const { stem } = downloadSaveNameParts("bad\uD800name.txt");
  assert.ok(stem.isWellFormed());
});

test("trailing dots and spaces left by the cut are stripped", () => {
  const dotted = downloadSaveNameParts(`${"a".repeat(195)}.....${"b".repeat(50)}`);
  assert.deepEqual(dotted, { stem: "a".repeat(195), extension: "" });
  const spaced = downloadSaveNameParts(`${"a".repeat(193)}   ${"b".repeat(50)}.pdf`);
  assert.deepEqual(spaced, { stem: "a".repeat(193), extension: ".pdf" });
  assert.deepEqual(downloadSaveNameParts("draft. . ."), { stem: "draft", extension: "" });
});

test("names with nothing usable fall back to download", () => {
  assert.equal(fullName("..."), "download");
  assert.equal(fullName(""), "download");
  assert.equal(fullName("   "), "download");
  assert.equal(fullName("folder/"), "download");
  assert.equal(fullName("...pdf"), "download.pdf");
});

test("path separators and reserved characters are sanitized on any platform", () => {
  assert.equal(fullName("C:\\Users\\me\\Downloads\\offer.pdf"), "offer.pdf");
  assert.equal(fullName("/Users/me/Downloads/offer.pdf"), "offer.pdf");
  assert.equal(fullName("../../etc/passwd"), "passwd");
  assert.equal(fullName("..\\..\\boot.ini"), "boot.ini");
  assert.equal(fullName('evil<name>:"x"|y?*.pdf'), "evil_name___x__y__.pdf");
  assert.equal(fullName("a\u0000b\u001fc.txt"), "a_b_c.txt");
  assert.equal(fullName("  padded name.pdf  "), "padded name.pdf");
});

test("an oversized or spaced extension is treated as part of the stem", () => {
  const longExt = downloadSaveNameParts(`${"x".repeat(300)}.${"y".repeat(20)}`);
  assert.equal(longExt.extension, "");
  assert.ok(bytes(longExt.stem) <= MAX_BYTES);
  assert.equal(longExt.stem, "x".repeat(MAX_BYTES));
  assert.deepEqual(downloadSaveNameParts("notes v2. final draft"), {
    stem: "notes v2. final draft",
    extension: "",
  });
  assert.deepEqual(downloadSaveNameParts("data.thisisaverylongext"), {
    stem: "data.thisisaverylongext",
    extension: "",
  });
});

test("dotfiles keep their leading dot and the extension budget counts bytes", () => {
  assert.deepEqual(downloadSaveNameParts(".env"), { stem: ".env", extension: "" });
  const cjkExt = downloadSaveNameParts("文件.简历简历简历");
  assert.deepEqual(cjkExt, { stem: "文件.简历简历简历", extension: "" }, "19-byte extension");
  assert.deepEqual(downloadSaveNameParts("文件.简历"), { stem: "文件", extension: ".简历" });
});
