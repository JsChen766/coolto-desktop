import assert from "node:assert/strict";
import test from "node:test";

import {
  parseApplicationCreate,
  parseApplicationUpdate,
  parseApplicationTransition,
  parseApplicationList,
  parseApplicationId,
} from "../src/desktop/main/application-library/application-ipc-validation.js";

test("Application IPC create 接受合法字段、拒绝未知字段", () => {
  const valid = parseApplicationCreate({
    companyName: "Acme",
    roleName: "Engineer",
    deliveryMethod: "manual",
    jdId: "jd-1",
    resumeId: null,
    appliedAt: "2026-07-31",
  });
  assert.equal(valid.companyName, "Acme");
  assert.equal(valid.deliveryMethod, "manual");
  assert.equal(valid.resumeId, null);
  assert.equal(valid.appliedAt, "2026-07-31");

  assert.throws(
    () => parseApplicationCreate({
      companyName: "Acme", roleName: "Engineer", deliveryMethod: "manual", admin: true,
    }),
    /不支持字段/,
  );
});

test("Application IPC create 校验类型和枚举", () => {
  assert.throws(
    () => parseApplicationCreate({ companyName: "", roleName: "Engineer", deliveryMethod: "manual" }),
    /不能为空/,
  );
  assert.throws(
    () => parseApplicationCreate({ companyName: "Acme", roleName: "Engineer", deliveryMethod: "fax" }),
    /不合法/,
  );
  assert.throws(
    () => parseApplicationCreate({ companyName: "Acme", roleName: "Engineer", deliveryMethod: "manual", source: "telegram" }),
    /不合法/,
  );
  assert.throws(
    () => parseApplicationCreate({ companyName: 123, roleName: "Engineer", deliveryMethod: "manual" }),
    /字符串/,
  );
});

test("Application IPC update 完整替换校验", () => {
  const result = parseApplicationUpdate({
    applicationId: " app-1 ",
    changes: {
      jdId: "jd-1", resumeId: null, companyName: "New Co", roleName: "Lead",
      deliveryMethod: "email_fill", targetUrl: null, appliedAt: null,
      pendingConfirmation: false, companyBusiness: null, roleSummary: null,
      companyCulture: null, rejectionReason: "不合适",
    },
  });
  assert.equal(result.applicationId, "app-1");
  assert.equal(result.changes.companyName, "New Co");
  assert.equal(result.changes.rejectionReason, "不合适");

  assert.throws(
    () => parseApplicationUpdate({
      applicationId: "app-1",
      changes: {
        jdId: null, resumeId: null, companyName: "A", roleName: "B",
        deliveryMethod: "manual", targetUrl: null, appliedAt: null,
        pendingConfirmation: false, companyBusiness: null, roleSummary: null,
        companyCulture: null, rejectionReason: null, bypass: true,
      },
    }),
    /不支持字段/,
  );
});

test("Application IPC transition 校验枚举", () => {
  const result = parseApplicationTransition({
    applicationId: "app-1",
    transition: { toStatus: "screening" },
  });
  assert.equal(result.transition.toStatus, "screening");

  assert.throws(
    () => parseApplicationTransition({
      applicationId: "app-1", transition: { toStatus: "hired" },
    }),
    /不合法/,
  );
  assert.throws(
    () => parseApplicationTransition({
      applicationId: "app-1", transition: { toStatus: "offer", force: true },
    }),
    /不支持字段/,
  );
});

test("Application IPC list 校验参数", () => {
  assert.equal(parseApplicationList(undefined), undefined);
  const result = parseApplicationList({ status: "applied", limit: 50 });
  assert.equal(result?.status, "applied");
  assert.equal(result?.limit, 50);

  assert.throws(() => parseApplicationList({ status: "all" }), /不合法/);
  assert.throws(() => parseApplicationList({ limit: -1 }), /不合法/);
  assert.throws(() => parseApplicationList({ extra: true }), /不支持字段/);
  const capped = parseApplicationList({ limit: 9999 });
  assert.equal(capped?.limit, 500);
});

test("Application IPC ID 校验", () => {
  assert.equal(parseApplicationId(" app-1 "), "app-1");
  assert.throws(() => parseApplicationId(""), /不能为空/);
  assert.throws(() => parseApplicationId(123), /不能为空/);
  assert.throws(() => parseApplicationId(null), /不能为空/);
});
