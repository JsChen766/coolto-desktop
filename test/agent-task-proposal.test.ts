import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { AgentTaskProposalService } from "../src/desktop/main/agent-task/agent-task-proposal-service.js";
import { createAgentTaskApprovalDraft } from
  "../src/desktop/main/agent-task/agent-task-approval.js";

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

test("Delegation proposal always includes the internal task lifecycle", () => {
  const proposal = service().proposals.prepare({
    ...input(),
    allowedActions: ["browser.read"],
  });
  assert.deepEqual(proposal.input.allowedActions, ["browser.read", "task.lifecycle"]);
});

test("Delegation approval names the Application read scope for the user", () => {
  const proposal = service().proposals.prepare({
    ...input(),
    allowedActions: [
      "mail.read", "mail.classify", "tracker.application.read",
    ],
    connectorPolicy: { mailConnectionIds: ["gmail-1"] },
  });
  const draft = createAgentTaskApprovalDraft(proposal);
  assert.match(JSON.stringify(draft.preview), /读取投递候选/u);
  assert.doesNotMatch(JSON.stringify(draft.preview), /tracker\.application\.read/u);
});

test("Outlook proposal freezes the exact personal redirect domain set", () => {
  const proposal = service().proposals.prepare({
    ...input(),
    allowedDomains: ["outlook.live.com"],
  });
  assert.deepEqual(proposal.input.allowedDomains, [
    "login.live.com", "login.microsoftonline.com", "outlook.cloud.microsoft",
    "outlook.live.com", "outlook.office.com",
  ]);
});

test("163 proposal freezes the exact entry and mailbox frontend domains", () => {
  const proposal = service().proposals.prepare({
    ...input(),
    allowedDomains: ["mail.163.com"],
  });
  assert.deepEqual(proposal.input.allowedDomains, [
    "hw.mail.163.com", "mail.163.com",
  ]);
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
      ...input(), allowedActions: ["mail.read", "mail.classify", "tracker.application.read"],
    }),
    /Browser Webmail|已连接邮箱/u,
  );
  assert.throws(() => value.proposals.prepare({
    ...input(), allowedActions: ["mail.read", "mail.classify"],
    connectorPolicy: { mailConnectionIds: ["gmail-1"] },
  }), /读取 Application 候选/u);
  assert.doesNotThrow(() => value.proposals.prepare({
    ...input(),
    allowedActions: ["mail.read", "mail.classify", "tracker.application.read"],
    connectorPolicy: { mailConnectionIds: ["gmail-1"] },
  }));
  assert.throws(() => value.proposals.prepare({
    ...input(), allowedActions: [
      "browser.read", "mail.read", "mail.classify", "tracker.application.read",
    ],
    connectorPolicy: { browserWebmail: true },
  }), /browser\.control.*browser\.write/u);
  assert.doesNotThrow(() => value.proposals.prepare({
    ...input(),
    allowedActions: [
      "browser.read", "browser.control", "browser.write",
      "mail.read", "mail.classify", "tracker.application.read",
    ],
    connectorPolicy: { browserWebmail: true },
  }));
});
