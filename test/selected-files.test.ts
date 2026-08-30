import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseCliArguments } from "../src/cli/args.js";
import { parseSelectedFile } from "../src/files/parse-selected-file.js";
import { SelectedFileRegistry } from "../src/files/selected-file-registry.js";
import { ConversationSelectedFiles } from "../src/desktop/main/conversation-selected-files.js";

test("CLI separates explicit attachments from natural-language input", async () => {
  assert.deepEqual(
    await parseCliArguments([
      "--attach",
      "/tmp/resume.pdf",
      "--attach=/tmp/history.docx",
      "请导入这些经历",
    ]),
    {
      prompt: "请导入这些经历",
      attachmentPaths: ["/tmp/resume.pdf", "/tmp/history.docx"],
    },
  );
});

test("selected file registry only reads explicitly registered text files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-import-"));
  const path = join(directory, "experience.txt");
  await writeFile(path, "AI Engineer\nBuilt a local agent.", "utf8");

  try {
    const registry = new SelectedFileRegistry();
    const [metadata] = await registry.registerPaths([path]);
    assert.equal(metadata?.filename, "experience.txt");
    assert.match(
      metadata?.id ?? "",
      /^attachment-[0-9a-f]{8}-[0-9a-f-]{27}$/u,
    );
    assert.deepEqual(Object.keys(metadata ?? {}).sort(), [
      "filename",
      "id",
      "sizeBytes",
      "type",
    ]);

    const parsed = await parseSelectedFile(
      await registry.read(metadata!.id),
    );
    assert.match(parsed.text, /Built a local agent/);
    await assert.rejects(
      registry.read("attachment-not-selected"),
      /明确选择/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("desktop attachment replacement is atomic and pins selected bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-replace-"));
  const firstPath = join(directory, "first.md");
  const secondPath = join(directory, "second.txt");
  const invalidPath = join(directory, "malware.exe");
  await writeFile(firstPath, "# First", "utf8");
  await writeFile(secondPath, "Second", "utf8");
  await writeFile(invalidPath, "invalid", "utf8");

  try {
    const registry = new SelectedFileRegistry();
    const [first] = await registry.replacePaths([firstPath]);
    await assert.rejects(
      registry.replacePaths([invalidPath]),
      /不支持的附件类型/u,
    );
    assert.equal(registry.list()[0]?.id, first?.id);

    const [second] = await registry.replacePaths([secondPath]);
    assert.equal(registry.list().length, 1);
    assert.notEqual(second?.id, first?.id);
    await assert.rejects(registry.read(first!.id), /明确选择/u);

    await writeFile(secondPath, "Second file changed after selection", "utf8");
    assert.equal(
      Buffer.from((await registry.read(second!.id)).content).toString("utf8"),
      "Second",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("selected file registry accepts 20MB and rejects anything larger", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-size-"));
  const validPath = join(directory, "valid.txt");
  const acceptedPdfPath = join(directory, "accepted.pdf");
  const oversizedPath = join(directory, "oversized.pdf");
  await writeFile(validPath, "valid", "utf8");
  await writeFile(acceptedPdfPath, "", "utf8");
  await writeFile(oversizedPath, "", "utf8");
  await truncate(acceptedPdfPath, 20 * 1024 * 1024);
  await truncate(oversizedPath, 20 * 1024 * 1024 + 1);

  try {
    const registry = new SelectedFileRegistry();
    await registry.registerPaths([validPath]);
    const accepted = await registry.registerPaths([acceptedPdfPath]);
    assert.equal(accepted[0]?.sizeBytes, 20 * 1024 * 1024);
    await assert.rejects(
      registry.registerPaths([oversizedPath]),
      /超过 20MB/u,
    );
    assert.equal(registry.list().length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("conversation attachment registries are isolated and releasable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-conversation-files-"));
  const firstPath = join(directory, "first.txt");
  const secondPath = join(directory, "second.md");
  await writeFile(firstPath, "first", "utf8");
  await writeFile(secondPath, "second", "utf8");

  try {
    const selectedFiles = new ConversationSelectedFiles();
    const firstRegistry = selectedFiles.forConversation("conversation-1");
    const first = await selectedFiles.replace("conversation-1", firstPath);
    const second = await selectedFiles.replace("conversation-2", secondPath);
    assert.equal(
      selectedFiles.forConversation("conversation-1"),
      firstRegistry,
    );
    assert.equal(firstRegistry.list()[0]?.id, first.id);
    assert.equal(selectedFiles.list("conversation-1")[0]?.id, first.id);
    assert.equal(selectedFiles.list("conversation-2")[0]?.id, second.id);
    assert.notEqual(first.id, second.id);

    selectedFiles.release("conversation-1");
    assert.deepEqual(selectedFiles.list("conversation-1"), []);
    assert.equal(selectedFiles.list("conversation-2").length, 1);
    assert.throws(
      () => selectedFiles.remove("conversation-1", first.id),
      /未找到/u,
    );

    selectedFiles.clear();
    assert.deepEqual(selectedFiles.list("conversation-2"), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("DOCX parser extracts local text", async () => {
  const fixturePath = join(
    process.cwd(),
    "node_modules/mammoth/test/test-data/single-paragraph.docx",
  );
  const parsed = await parseSelectedFile({
    metadata: {
      id: "attachment-docx",
      filename: "single-paragraph.docx",
      type: "docx",
      sizeBytes: (await readFile(fixturePath)).byteLength,
    },
    content: await readFile(fixturePath),
  });

  assert.match(parsed.text, /Walking on imported air/);
});

test("PDF parser extracts selectable resume text", async () => {
  const content = createTextPdf("Alice Chen resume@example.test");
  const parsed = await parseSelectedFile({
    metadata: { id: "attachment-pdf", filename: "resume.pdf", type: "pdf", sizeBytes: content.byteLength },
    content,
  });
  assert.match(parsed.text, /Alice Chen resume@example\.test/u);
});

test("textless PDF reports that OCR is unavailable", async () => {
  const content = createTextlessPdf();
  await assert.rejects(
    parseSelectedFile({
      metadata: {
        id: "attachment-textless-pdf",
        filename: "scanned-resume.pdf",
        type: "pdf",
        sizeBytes: content.byteLength,
      },
      content,
    }),
    /扫描版 PDF 暂不支持 OCR/u,
  );
});

function createTextlessPdf(): Buffer {
  const header = "%PDF-1.4\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    [
      "3 0 obj\n",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ",
      "/Contents 4 0 R /Resources << >> >>\n",
      "endobj\n",
    ].join(""),
    "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
  ];
  const offsets: number[] = [];
  let body = header;
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body);
  const xrefRows = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  return Buffer.from(
    `${body}xref\n0 5\n0000000000 65535 f \n${xrefRows}` +
      `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
}

function createTextPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const header = "%PDF-1.4\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  const offsets: number[] = [];
  let body = header;
  for (const object of objects) { offsets.push(Buffer.byteLength(body)); body += object; }
  const xref = Buffer.byteLength(body);
  const rows = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${body}xref\n0 6\n0000000000 65535 f \n${rows}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
