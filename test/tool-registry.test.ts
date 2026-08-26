import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "../src/tools/registry.js";
import { ExperienceReferenceRegistry } from "../src/tools/experience-reference-registry.js";
import { requireToolCapability } from "../src/tools/tool-capabilities.js";
import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";

test("tool registry has unique, explicitly scoped tools", async () => {
  const tools = createToolRegistry();
  const names = tools.map((tool) => tool.name);

  assert.deepEqual(names, ["get_runtime_info"]);
  assert.equal(new Set(names).size, names.length);
  assert.ok(tools.every((tool) => requireToolCapability(tool).requiredScopes.length > 0));

  const runtimeTool = tools[0];
  assert.ok(runtimeTool);
  const result = await runtimeTool.execute("test-call", {});

  assert.equal(result.details.runtime, "local-pi-agent");
  assert.equal(result.details.architecture, "single-agent");
  assert.equal(result.details.cloudLangGraphUsed, false);
  assert.equal(result.details.persistentAssetCacheEnabled, false);
});

test("registry exposes Answer Vault only through scoped read and prepare tools", () => {
  const services = new AgentHarnessServices(
    "owner-1",
    new AgentHarnessStateRepository(
      "owner-1", new MemoryAgentHarnessStatePersistence(),
    ),
  );
  const tools = createToolRegistry({
    answerVault: services.answers,
    approvalManager: {} as never,
  });
  assert.deepEqual(tools.map((tool) => tool.name), [
    "get_runtime_info", "get_answer_vault", "prepare_answer_vault_entry",
  ]);
  assert.deepEqual(requireToolCapability(tools[1]!).requiredScopes, ["answers.read"]);
  assert.deepEqual(requireToolCapability(tools[2]!).requiredScopes, ["answers.prepare"]);
});

test("workspace projection shortens education IDs discovered inside snapshot creation", async () => {
  const canonicalId = "8d7f6e5a-education-id";
  const details = {
    source: { experiences: [{ id: canonicalId, category: "education" }] },
    resume: { items: [{ sourceExperienceId: canonicalId }] },
  };
  const wrapped = new ExperienceReferenceRegistry().wrap({
    name: "create_resume_workspace",
    label: "test",
    description: "test",
    parameters: {} as never,
    execute: async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(details) }],
      details,
    }),
  });

  const result = await wrapped.execute("workspace", {});
  const content = result.content[0];
  const projected = JSON.parse(content?.type === "text" ? content.text : "{}");
  assert.equal(projected.source.experiences[0].id, "exp_1");
  assert.equal(projected.resume.items[0].sourceExperienceId, "exp_1");
  assert.equal((result.details as typeof details).source.experiences[0]?.id, canonicalId);
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
  const canonicalId = "01a00a4f-f312-7132-8036-984b133ae3ea";
  const requestedIds: string[] = [];
  const experience = (experienceId: string) => ({
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
        factBankStatus: "completed" as const,
        createdAt: "2026-06-01T00:00:00Z",
      },
    ],
  });
  const reader = {
    searchExperiences: async () => ({
      items: [experience(canonicalId)],
      nextCursor: null,
    }),
    getExperience: async (experienceId: string) => {
      requestedIds.push(experienceId);
      return experience(experienceId);
    },
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

  const searchResult = await tools[1]!.execute("search", {});
  const searchContent = searchResult.content[0];
  assert.equal(searchContent?.type, "text");
  const modelSearch = JSON.parse(
    searchContent?.type === "text" ? searchContent.text : "{}",
  );
  assert.equal(modelSearch.items[0].id, "exp_1");
  assert.equal(searchResult.details.items[0]?.id, canonicalId);

  const detailResult = await tools[2]!.execute("detail", {
    experienceId: "exp_1",
  });
  assert.equal(requestedIds[0], canonicalId);
  assert.equal(detailResult.details.id, canonicalId);
  const detailContent = detailResult.content[0];
  assert.equal(detailContent?.type, "text");
  assert.equal(JSON.parse(
    detailContent?.type === "text" ? detailContent.text : "{}",
  ).id, "exp_1");
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
        contactEmail: "resume@example.com",
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

test("profile update tool requires a profile proposal executor and approval manager", () => {
  const tools = createToolRegistry({
    userProfileReader: { getUserProfile: async () => ({}) } as never,
    profileProposals: {} as never,
    approvalManager: {} as never,
  });

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["get_runtime_info", "get_user_profile", "prepare_profile_update"],
  );
});

const jdRecord = {
  id: "jd-1",
  title: "Product Manager",
  company: "Example",
  targetRole: "Product Manager",
  sourceKind: "pasted" as const,
  sourceUrl: null,
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
