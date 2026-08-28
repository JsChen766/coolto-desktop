import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("PDF postflight falls back when native canvas cannot load", () => {
  const script = String.raw`
import Module from "node:module";

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@napi-rs/canvas" || request.startsWith("@napi-rs/canvas-")) {
    throw new Error("SIMULATED_NATIVE_CANVAS_UNAVAILABLE");
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  delete globalThis.DOMMatrix;
  delete globalThis.DOMPoint;
  delete globalThis.Path2D;
  const { inspectResumePdf } = await import(process.env.POSTFLIGHT_MODULE_URL);
  const result = await inspectResumePdf(
    Buffer.from(process.env.TEST_PDF_BASE64, "base64"),
  );
  process.stdout.write(JSON.stringify({
    pageCount: result.pageCount,
    hasTextLayer: result.hasTextLayer,
    domMatrixType: typeof globalThis.DOMMatrix,
  }));
} finally {
  Module._load = originalLoad;
}
`;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        POSTFLIGHT_MODULE_URL: pathToFileURL(
          resolve("src/resume/pdf-postflight.ts"),
        ).href,
        TEST_PDF_BASE64: createTextPdf("Fallback test").toString("base64"),
      },
    },
  );
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.deepEqual(JSON.parse(child.stdout), {
    pageCount: 1,
    hasTextLayer: true,
    domMatrixType: "function",
  });
});

function createTextPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const header = "%PDF-1.4\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n` +
      `${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  const offsets: number[] = [];
  let body = header;
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xref = Buffer.byteLength(body);
  const rows = offsets.map((offset) =>
    `${String(offset).padStart(10, "0")} 00000 n \n`
  ).join("");
  return Buffer.from(
    `${body}xref\n0 6\n0000000000 65535 f \n${rows}` +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
}
