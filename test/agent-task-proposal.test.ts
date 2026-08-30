import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { AgentTaskProposalService } from "../src/desktop/main/agent-task/agent-task-proposal-service.js";

function service() {
  const repository = new AgentHarnessStateRepository(
    "owner",
    new MemoryAgentHarnessStatePersistence(),
  );
  const services = new AgentHarnessServices("owner", repository);
  return { services, proposals: new AgentTaskProposalService(services) };
}

const input = () => ({
  conversationId: "conversation",
  goal: "Find backend roles",
  allowedDomains: ["jobs.example"],
  blockedDomains: [],
  allowedActions: ["browser.read", "browser.control", "task.lifecycle"],
  jobCriteria: { minimumMatch: 80 },
  assetPolicy: {},
  answerPolicy: {},
  unattended: true,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});

test("Delegation proposal has no side effect before execute and replay is idempotent", async () => {
  const value = service();
  const proposal = value.proposals.prepare(input());
  assert.equal((await value.services.tasks.list()).length, 0);
  assert.equal(proposal.minimumMatch, 80);
  assert.equal(proposal.dailyApplicationLimit, null);
  assert.equal(proposal.mailSendAlwaysManual, true);
  assert.equal(proposal.appOpenOnly, true);

  const taskId = await value.proposals.execute(proposal.id);
  assert.equal(await value.proposals.execute(proposal.id), taskId);
  const task = await value.services.tasks.get(taskId);
  assert.equal(task.status, "queued");
  assert.ok(task.grantId);
});

test("Delegation proposal rejects mail.send and non-domain URLs", () => {
  const value = service();
  assert.throws(
    () => value.proposals.prepare({
      ...input(),
      allowedActions: ["browser.read", "mail.send"],
    }),
    /mail.send/u,
  );
  assert.throws(
    () => value.proposals.prepare({
      ...input(),
      allowedDomains: ["https://jobs.example/path"],
    }),
    /无效授权 domain/u,
  );
  assert.throws(
    () => value.proposals.prepare({
      ...input(), allowedActions: ["mail.read", "mail.classify"],
    }),
    /Browser Webmail|已连接邮箱/u,
  );
  assert.doesNotThrow(() => value.proposals.prepare({
    ...input(), allowedActions: ["mail.read", "mail.classify"],
    connectorPolicy: { mailConnectionIds: ["gmail-1"] },
  }));
  assert.doesNotThrow(() => value.proposals.prepare({
    ...input(), allowedActions: ["browser.read", "mail.read", "mail.classify"],
    connectorPolicy: { browserWebmail: true },
  }));
});
