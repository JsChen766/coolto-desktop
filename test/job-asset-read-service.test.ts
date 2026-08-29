import assert from "node:assert/strict";
import test from "node:test";

import { JobAssetReadService } from "../src/desktop/main/job-assets/job-asset-read-service.js";
import {
  repositoryApplication,
  repositoryJd,
  repositoryResume,
} from "./support/job-repository-fixture.js";

test("reads every JD and Application page before projecting", async () => {
  const jdCursors: Array<string | undefined> = [];
  const applicationCursors: Array<string | undefined> = [];
  const service = new JobAssetReadService(
    {
      listJds: async ({ cursor }) => {
        jdCursors.push(cursor);
        return cursor
          ? { items: [repositoryJd("b")], nextCursor: null }
          : { items: [repositoryJd("a")], nextCursor: "jd-page-2" };
      },
    },
    { list: async () => [repositoryResume("resume", "a")] },
    {
      listApplications: async ({ cursor }) => {
        applicationCursors.push(cursor);
        return cursor
          ? { items: [repositoryApplication("app-b", "b", "resume")], nextCursor: null }
          : { items: [repositoryApplication("app-a", "a", "resume")], nextCursor: "app-page-2" };
      },
    },
    { list: async () => [] },
  );

  const snapshot = await service.get();

  assert.deepEqual(jdCursors, [undefined, "jd-page-2"]);
  assert.deepEqual(applicationCursors, [undefined, "app-page-2"]);
  assert.equal(snapshot.jds.length, 2);
  assert.equal(snapshot.resumes[0]?.applicationSummary.total, 2);
});

test("rejects a repeated pagination cursor instead of looping", async () => {
  const service = new JobAssetReadService(
    { listJds: async () => ({ items: [], nextCursor: "repeat" }) },
    { list: async () => [] },
    { listApplications: async () => ({ items: [], nextCursor: null }) },
    { list: async () => [] },
  );

  await assert.rejects(service.get(), /本地分页游标重复/);
});
