import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { extractLayoutText } from "../src/files/pdf-layout.js";
import { ensurePdfEnvironment } from "../src/files/pdfjs-environment.js";
import { createSinglePageTextLinesPdf } from "./support/material-pdf-fixture.js";

test("PDF layout follows real top-to-bottom PDF coordinates", async () => {
  await ensurePdfEnvironment();
  const require = createRequire(import.meta.url);
  const { getDocument } = require(
    "pdfjs-dist/legacy/build/pdf.mjs",
  ) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(createSinglePageTextLinesPdf([
      "Top education", "Middle education", "Bottom education",
    ])),
  });
  try {
    const document = await loading.promise;
    const page = await document.getPage(1);
    assert.equal(extractLayoutText(await page.getTextContent()),
      "Top education\nMiddle education\nBottom education");
  } finally {
    await loading.destroy();
  }
});
