import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "../src/tools/registry.js";

test("tool registry has unique, explicitly scoped tools", async () => {
  const tools = createToolRegistry();
  const names = tools.map((tool) => tool.name);

  assert.deepEqual(names, ["get_runtime_info"]);
  assert.equal(new Set(names).size, names.length);

  const runtimeTool = tools[0];
  assert.ok(runtimeTool);
  const result = await runtimeTool.execute("test-call", {});

  assert.equal(result.details.runtime, "local-pi-agent");
  assert.equal(result.details.architecture, "single-agent");
  assert.equal(result.details.cloudLangGraphUsed, false);
  assert.equal(result.details.persistentAssetCacheEnabled, false);
});

test("authenticated registry exposes the current user tool", async () => {
  const tools = createToolRegistry({
    currentUserReader: {
      getCurrentUser: async () => ({
        id: "user-1",
        email: "alice@example.com",
      }),
    },
  });

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["get_runtime_info", "get_current_user"],
  );

  const currentUserTool = tools[1];
  assert.ok(currentUserTool);
  const result = await currentUserTool.execute("test-call", {});
  assert.deepEqual(result.details, {
    id: "user-1",
    email: "alice@example.com",
  });
});

test("experience registry exposes list and detail tools", async () => {
  const reader = {
    searchExperiences: async () => ({
      items: [],
      nextCursor: null,
    }),
    getExperience: async (experienceId: string) => ({
      id: experienceId,
      category: "work" as const,
      title: "Example",
      organization: null,
      role: null,
      location: null,
      startDate: null,
      endDate: null,
      tags: [],
      status: "active" as const,
      currentRevisionId: null,
      entityVersion: 1,
      deletedAt: null,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
      revisions: [
        {
          id: "rev-old",
          experienceId,
          content: "historical content",
          source: "manual",
          revisionHash: "hash",
          factBankStatus: "completed",
          createdAt: "2026-06-01T00:00:00Z",
        },
      ],
    }),
  };
  const tools = createToolRegistry({ experienceReader: reader });

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["get_runtime_info", "search_experiences", "get_experience"],
  );

  const runtimeResult = await tools[0]!.execute("runtime", {});
  assert.deepEqual(runtimeResult.details.implementedBusinessTools, [
    "search_experiences",
    "get_experience",
  ]);

  const detailResult = await tools[2]!.execute("detail", {
    experienceId: "exp-1",
  });
  assert.equal(detailResult.details.id, "exp-1");
  assert.equal(
    JSON.stringify(detailResult).includes("historical content"),
    false,
  );
});

test("resume source registry exposes profile and JD read tools", async () => {
  const tools = createToolRegistry({
    userProfileReader: {
      getUserProfile: async () => ({
        fullName: "Alice Chen",
        email: "alice@example.com",
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        personalWebsite: null,
        currentTitle: null,
        currentCompany: null,
        yearsOfExperience: null,
        careerStage: null,
        targetRoles: [],
        targetIndustries: [],
        targetLocations: [],
        preferredLanguage: "zh-CN",
        resumeStyle: null,
      }),
    },
    jdReader: {
      listJds: async () => ({ items: [jdRecord], nextCursor: null }),
      getJd: async () => jdRecord,
    },
  });

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["get_runtime_info", "get_user_profile", "search_jds", "get_jd"],
  );
  const searchResult = await tools[2]!.execute("search-jds", {});
  assert.equal(searchResult.details.items[0]?.id, "jd-1");
  assert.equal(JSON.stringify(searchResult).includes("Full JD text"), false);
  const detailResult = await tools[3]!.execute("get-jd", { jdId: "jd-1" });
  assert.equal(detailResult.details.rawText, "Full JD text");
});

const jdRecord = {
  id: "jd-1",
  title: "Product Manager",
  company: "Example",
  targetRole: "Product Manager",
  rawText: "Full JD text",
  requirements: [
    {
      id: "req-1",
      text: "Build data products",
      category: "domain",
      importance: "high" as const,
      keywords: ["data"],
      weight: 0.9,
      v2Importance: "must_have" as const,
      v2Category: "domain",
    },
  ],
  jdHash: "jd-hash",
  requirementMapId: "map-1",
  requirementsOrigin: "parsed",
  sourceThreadId: null,
  entityVersion: 1,
  deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-02T00:00:00Z",
};
