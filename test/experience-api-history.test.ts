import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedRequester } from "../src/api/api-transport.js";
import { ExperienceApi } from "../src/api/experience-api.js";

test("Experience API reads a cursor page from the online history endpoint", async () => {
  let requested = "";
  const requester: AuthenticatedRequester = {
    async request<T>(path: string): Promise<T> {
      requested = path;
      return {
        items: [{
          id: "rev-2", experienceId: "exp/1", content: "Second",
          source: "manual", revisionHash: "hash", factBankStatus: "not_applicable",
          createdAt: "2026-07-29T00:00:00.000Z",
        }],
        nextCursor: "1",
      } as T;
    },
  };
  const page = await new ExperienceApi(requester)
    .listExperienceRevisions(" exp/1 ", "2", 10);
  assert.equal(
    requested,
    "/v1/product/experiences/exp%2F1/revisions?limit=10&cursor=2",
  );
  assert.equal(page.items[0]?.id, "rev-2");
  assert.equal(page.nextCursor, "1");
});
