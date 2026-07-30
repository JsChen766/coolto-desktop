import assert from "node:assert/strict";
import test from "node:test";
import { statusHistoryConsistent } from "../src/tracker/status-history.js";
import type { ApplicationRecord, ApplicationStatusEvent } from "../src/desktop/shared/types.js";

const application = { id: "app", status: "screening", syncStatus: "clean" } as ApplicationRecord;
const event = { id: "event", applicationId: "app", toStatus: "screening",
  occurredAt: "2026-07-29T00:00:00.000Z" } as ApplicationStatusEvent;

test("clean Application 的最新服务端事件必须等于当前状态", () => {
  assert.equal(statusHistoryConsistent(application, [event]), true);
  assert.equal(statusHistoryConsistent({ ...application, status: "interviewing" }, [event]), false);
  assert.equal(statusHistoryConsistent({ ...application, status: "applied" }, []), true);
  assert.equal(statusHistoryConsistent({ ...application, status: "interviewing", syncStatus: "pending" }, [event]), true);
});
