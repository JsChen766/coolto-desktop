export function createMultiPageTextPdf(pages: readonly string[]): Buffer {
  const fontId = 3;
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const objects = new Map<number, string>([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`],
    [fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
  ]);
  pages.forEach((text, index) => {
    const pageId = pageIds[index]!;
    const streamId = pageId + 1;
    const stream = `BT /F1 11 Tf 50 720 Td (${escapePdfText(text)}) Tj ET`;
    objects.set(pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    objects.set(streamId,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });
  const objectCount = 3 + pages.length * 2;
  const offsets: number[] = [];
  let body = "%PDF-1.4\n";
  for (let id = 1; id <= objectCount; id += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  const rows = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  return Buffer.from(
    `${body}xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${rows}` +
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`,
  );
}

export function createSinglePageTextLinesPdf(lines: readonly string[]): Buffer {
  const stream = [
    "BT /F1 11 Tf 50 720 Td",
    ...lines.flatMap((line, index) => [
      ...(index ? ["0 -20 Td"] : []),
      `(${escapePdfText(line)}) Tj`,
    ]),
    "ET",
  ].join(" ");
  const objects = new Map<number, string>([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [4 0 R] /Count 1 >>"],
    [3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
    [4, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>"],
    [5, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`],
  ]);
  return pdf(objects, 5);
}

function escapePdfText(value: string): string {
  return value.replace(/([\\()])/gu, "\\$1");
}

function pdf(objects: ReadonlyMap<number, string>, objectCount: number): Buffer {
  const offsets: number[] = [];
  let body = "%PDF-1.4\n";
  for (let id = 1; id <= objectCount; id += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  const rows = offsets.map((offset) =>
    `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${body}xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${rows}` +
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`);
}
