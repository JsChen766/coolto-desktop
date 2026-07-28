import assert from "node:assert/strict";
import test from "node:test";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

import type {
  ExperienceCreateInput,
  ExperienceDetail,
} from "../src/api/types.js";
import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { createCooltoAgent } from "../src/agent/create-agent.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import { createToolRegistry } from "../src/tools/registry.js";

test("Pi prepares an import and the host commits only after approval", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall(
        "prepare_experience_import",
        {
          sourceType: "text",
          sourceLabel: "用户粘贴文本",
          candidates: [
            {
              category: "project",
              title: "Local Agent",
              content: "Built a local agent.",
              tags: ["TypeScript"],
            },
          ],
        },
        { id: "prepare-call" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("候选已准备，请在待决策卡片中选择。"),
  ]);

  const created: ExperienceCreateInput[] = [];
  const reader = {
    searchExperiences: async () => ({
      items: [],
      nextCursor: null,
    }),
    getExperience: async () => createExperienceDetail("unused"),
  };
  const writer = {
    createExperience: async (input: ExperienceCreateInput) => {
      created.push(input);
      return createExperienceDetail("exp-created");
    },
  };
  const proposalStore = new ExperienceImportProposalStore();
  const approvalManager = createActionApprovalManager({
    experienceWriter: writer,
    importProposalStore: proposalStore,
  });
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry({
        experienceReader: reader,
        importProposalStore: proposalStore,
        approvalManager,
      }),
      approvalManager,
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.prompt("请导入：我做过一个 Local Agent 项目。");
  const proposal = proposalStore.getActive();
  assert.ok(proposal);
  assert.equal(created.length, 0);
  assert.equal(
    agent.toolNames.includes("commit_experience_import"),
    false,
  );

  const pending = agent.getPendingApprovals();
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.actionType, "experience.import");
  await agent.resolveApproval(pending[0]!.id, { type: "accept" });

  assert.equal(created.length, 1);
  assert.equal(created[0]?.title, "Local Agent");
  assert.equal(proposalStore.getActive(), undefined);
});

function createExperienceDetail(id: string): ExperienceDetail {
  return {
    id,
    category: "project",
    title: "Local Agent",
    organization: null,
    role: null,
    location: null,
    startDate: null,
    endDate: null,
    tags: ["TypeScript"],
    status: "active",
    currentRevisionId: "rev-1",
    currentRevision: {
      id: "rev-1",
      experienceId: id,
      content: "Built a local agent.",
      source: "manual",
      revisionHash: "hash",
      factBankStatus: "pending",
      createdAt: "2026-07-01T00:00:00Z",
    },
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    revisions: [],
  };
}
