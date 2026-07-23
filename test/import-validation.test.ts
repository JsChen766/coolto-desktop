import assert from "node:assert/strict";
import test from "node:test";

import { normalizeImportCandidate } from "../src/import/validation.js";

test("import candidate normalization keeps facts and normalizes fields", () => {
  assert.deepEqual(
    normalizeImportCandidate(
      {
        category: "work",
        title: " AI Engineer ",
        content: " Built an agent. ",
        organization: " Example ",
        startDate: "2025-01",
        endDate: "present",
        tags: ["AI", "AI", " TypeScript "],
      },
      "candidate-1",
    ),
    {
      clientId: "candidate-1",
      category: "work",
      title: "AI Engineer",
      content: "Built an agent.",
      organization: "Example",
      startDate: "2025-01",
      endDate: "present",
      tags: ["AI", "TypeScript"],
    },
  );
});

test("import candidate normalization rejects invalid dates", () => {
  assert.throws(
    () =>
      normalizeImportCandidate(
        {
          category: "work",
          title: "Example",
          content: "Content",
          startDate: "January 2025",
        },
        "candidate-1",
      ),
    /日期格式无效/,
  );
});
