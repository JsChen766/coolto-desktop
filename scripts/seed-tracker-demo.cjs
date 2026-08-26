"use strict";

// 一次性本地 Tracker 看板模拟数据 seed。
// 直接向当前账号的 local-sync.sqlite 写入 sync_status='clean' 的实体，
// 不写入 local_outbox，因此不会同步到生产服务器。
// 运行方式：./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/seed-tracker-demo.cjs

const { app, safeStorage } = require("electron");
const { createHash } = require("node:crypto");
const { createCipheriv } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const FORMAT_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

class PayloadCodec {
  constructor(key) {
    this.key = key;
  }
  encode(value) {
    const iv = require("node:crypto").randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([
      Buffer.from([FORMAT_VERSION]),
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]);
  }
}

function now() {
  return new Date().toISOString();
}

function loadKey(directory) {
  const pathFile = path.join(directory, "payload-key.coolto");
  const encrypted = fs.readFileSync(pathFile);
  const decoded = Buffer.from(safeStorage.decryptString(encrypted), "base64");
  if (decoded.length !== 32) throw new Error("payload key 长度无效");
  return decoded;
}

function selectSyncDir() {
  const base = path.join(app.getPath("userData"), "sync");
  const candidates = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name));
  let best = null;
  let bestScore = -1;
  for (const dir of candidates) {
    const dbPath = path.join(dir, "local-sync.sqlite");
    const keyPath = path.join(dir, "payload-key.coolto");
    if (!fs.existsSync(dbPath) || !fs.existsSync(keyPath)) continue;
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          "SELECT entity_type, COUNT(*) AS c FROM sync_entities GROUP BY entity_type",
        )
        .all();
      let score = 0;
      for (const row of rows) {
        if (["experience", "job_description", "application"].includes(row.entity_type)) {
          score += Number(row.c);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    } finally {
      db.close();
    }
  }
  return best;
}

const INTERVIEW_TYPES = ["phone", "video", "onsite", "hr", "technical", "case", "other"];
const INTERVIEW_STATUSES = ["scheduled", "completed", "canceled"];
const NOTE_TYPES = ["general", "interview", "follow_up", "company"];
const REMINDER_STATUSES = ["scheduled", "delivered", "dismissed", "canceled"];
const APP_STATUSES = ["applied", "screening", "interviewing", "offer", "rejected", "no_response"];

function insertEntity(db, codec, entityType, entityId, payload) {
  const row = {
    entity_type: entityType,
    entity_id: entityId,
    entity_version: 1,
    local_version: 1,
    sync_status: "clean",
    operation: "upsert",
    changed_at: payload.updatedAt ?? payload.createdAt ?? now(),
    payload: codec.encode(payload),
    last_server_operation: null,
    last_server_payload: null,
    last_error_code: null,
  };
  db.prepare(`
    INSERT INTO sync_entities
      (entity_type, entity_id, entity_version, local_version, sync_status,
       operation, changed_at, payload, last_server_operation,
       last_server_payload, last_error_code)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET
      entity_version = excluded.entity_version,
      local_version = excluded.local_version,
      sync_status = excluded.sync_status,
      operation = excluded.operation,
      changed_at = excluded.changed_at,
      payload = excluded.payload,
      last_server_operation = excluded.last_server_operation,
      last_server_payload = excluded.last_server_payload,
      last_error_code = excluded.last_error_code
  `).run(
    row.entity_type,
    row.entity_id,
    row.entity_version,
    row.local_version,
    row.sync_status,
    row.operation,
    row.changed_at,
    row.payload,
    row.last_server_operation,
    row.last_server_payload,
    row.last_error_code,
  );
}

let seq = 0;
function uid(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusEvent(applicationId, fromStatus, toStatus, reason, occurredAt) {
  return {
    id: uid("evt"),
    applicationId,
    fromStatus,
    toStatus,
    reason,
    occurredAt,
    operationId: uid("op"),
    createdAt: occurredAt,
  };
}

function interview(applicationId, roundNumber, interviewType, scheduledAt, status, extra = {}) {
  return {
    id: uid("ivw"),
    applicationId,
    roundNumber,
    interviewType,
    scheduledAt: scheduledAt ?? null,
    timezone: extra.timezone ?? "Asia/Shanghai",
    durationMinutes: extra.durationMinutes ?? 45,
    locationOrLink: extra.locationOrLink ?? null,
    interviewer: extra.interviewer ?? null,
    status,
    entityVersion: 1,
    createdAt: now(),
    updatedAt: now(),
  };
}

function note(applicationId, noteType, content, extra = {}) {
  return {
    id: uid("nte"),
    applicationId,
    interviewRoundId: extra.interviewRoundId ?? null,
    noteType,
    content,
    entityVersion: 1,
    createdAt: now(),
    updatedAt: now(),
  };
}

function reminder(applicationId, title, remindAt, status, extra = {}) {
  return {
    id: uid("rmd"),
    applicationId,
    interviewRoundId: extra.interviewRoundId ?? null,
    title,
    remindAt,
    status,
    deliveredAt: extra.deliveredAt ?? null,
    entityVersion: 1,
    createdAt: now(),
    updatedAt: now(),
  };
}

function buildApplications() {
  const items = [];
  const nowIso = now();

  const application = (fields) => {
    const id = uid("app");
    items.push({
      id,
      ...fields,
      entityVersion: 1,
      createdAt: fields.createdAt ?? nowIso,
      updatedAt: fields.updatedAt ?? nowIso,
    });
    return id;
  };

  // 已投递
  application({
    jdId: null,
    resumeId: null,
    companyName: "字节跳动",
    roleName: "后端开发工程师",
    jdTitleSnapshot: "高级后端开发工程师（抖音）",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "form_fill",
    targetUrl: "https://jobs.bytedance.com/position/713",
    appliedAt: "2026-08-02T09:00:00.000Z",
    status: "applied",
    pendingConfirmation: false,
    source: "browser",
    dedupeKey: null,
    companyBusiness: "抖音、今日头条等产品",
    roleSummary: "负责抖音推荐链路的后端服务",
    companyCulture: "追求极致、始终创业",
    rejectionReason: null,
  });

  application({
    jdId: null,
    resumeId: null,
    companyName: "腾讯",
    roleName: "产品运营专员",
    jdTitleSnapshot: "内容产品运营",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "manual",
    targetUrl: null,
    appliedAt: "2026-08-05T02:30:00.000Z",
    status: "applied",
    pendingConfirmation: true,
    source: "manual",
    dedupeKey: null,
    companyBusiness: "社交与内容平台",
    roleSummary: "负责信息流内容生态运营",
    companyCulture: null,
    rejectionReason: null,
  });

  // 筛选沟通
  const screeningId = application({
    jdId: null,
    resumeId: null,
    companyName: "阿里巴巴",
    roleName: "数据产品经理",
    jdTitleSnapshot: "数据中台产品经理",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "email_fill",
    targetUrl: "https://talent.alibaba.com",
    appliedAt: "2026-07-20T08:00:00.000Z",
    status: "screening",
    pendingConfirmation: false,
    source: "email",
    dedupeKey: null,
    companyBusiness: "电商与云计算",
    roleSummary: "负责数据中台指标体系",
    companyCulture: "客户第一",
    rejectionReason: null,
  });
  insertStatusEventItems.push(
    statusEvent(screeningId, "applied", "screening", null, "2026-07-22T03:00:00.000Z"),
  );

  const screeningId2 = application({
    jdId: null,
    resumeId: null,
    companyName: "蚂蚁集团",
    roleName: "风控产品经理",
    jdTitleSnapshot: "数字金融风控产品",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "form_fill",
    targetUrl: "https://talent.antgroup.com",
    appliedAt: "2026-07-25T06:00:00.000Z",
    status: "screening",
    pendingConfirmation: false,
    source: "browser",
    dedupeKey: null,
    companyBusiness: "数字金融服务",
    roleSummary: "负责支付风控产品",
    companyCulture: null,
    rejectionReason: null,
  });
  insertStatusEventItems.push(
    statusEvent(screeningId2, "applied", "screening", null, "2026-07-27T01:00:00.000Z"),
  );

  // 面试中
  const interviewingId = application({
    jdId: null,
    resumeId: null,
    companyName: "美团",
    roleName: "商业产品经理",
    jdTitleSnapshot: "本地生活商业产品经理",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "form_fill",
    targetUrl: "https://zhaopin.meituan.com",
    appliedAt: "2026-07-10T02:00:00.000Z",
    status: "interviewing",
    pendingConfirmation: false,
    source: "browser",
    dedupeKey: null,
    companyBusiness: "本地生活服务",
    roleSummary: "负责到店业务商业化",
    companyCulture: "以客户为中心",
    rejectionReason: null,
  });
  insertInterviewItems.push(
    interview(interviewingId, 1, "video", "2026-07-15T06:00:00.000Z", "completed", {
      interviewer: "张 HR",
      locationOrLink: "腾讯会议",
    }),
    interview(interviewingId, 2, "onsite", "2026-08-12T03:00:00.000Z", "scheduled", {
      interviewer: "李 高级产品",
      locationOrLink: "北京来广营",
    }),
  );
  insertReminderItems.push(
    reminder(interviewingId, "二面提醒", "2026-08-11T01:00:00.000Z", "scheduled", {
      interviewRoundId: undefined,
    }),
  );
  insertNoteItems.push(
    note(interviewingId, "interview", "一面聊了商业化模型，二面重点准备本地生活案例。"),
    note(interviewingId, "company", "美团面试官对数据处理经验评价积极。"),
  );
  insertStatusEventItems.push(
    statusEvent(interviewingId, "applied", "screening", null, "2026-07-12T01:00:00.000Z"),
    statusEvent(interviewingId, "screening", "interviewing", "HR 约面", "2026-07-13T02:00:00.000Z"),
  );

  const interviewingId2 = application({
    jdId: null,
    resumeId: null,
    companyName: "拼多多",
    roleName: "数据分析师",
    jdTitleSnapshot: "供应链数据分析",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "manual",
    targetUrl: null,
    appliedAt: "2026-07-18T07:00:00.000Z",
    status: "interviewing",
    pendingConfirmation: false,
    source: "manual",
    dedupeKey: null,
    companyBusiness: "电商",
    roleSummary: "供应链成本分析",
    companyCulture: null,
    rejectionReason: null,
  });
  insertInterviewItems.push(
    interview(interviewingId2, 1, "phone", "2026-07-21T03:00:00.000Z", "completed", {
      interviewer: "王",
    }),
    interview(interviewingId2, 2, "technical", "2026-08-13T06:00:00.000Z", "scheduled", {
      interviewer: "赵 数据负责人",
      locationOrLink: "视频面试",
    }),
  );
  insertReminderItems.push(
    reminder(interviewingId2, "二面技术面试", "2026-08-12T02:00:00.000Z", "scheduled"),
  );
  insertStatusEventItems.push(
    statusEvent(interviewingId2, "applied", "screening", null, "2026-07-19T01:00:00.000Z"),
    statusEvent(interviewingId2, "screening", "interviewing", null, "2026-07-20T02:00:00.000Z"),
  );

  // Offer
  const offerId = application({
    jdId: null,
    resumeId: null,
    companyName: "快手",
    roleName: "策略产品经理",
    jdTitleSnapshot: "推荐策略产品经理",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "form_fill",
    targetUrl: "https://campus.kuaishou.com",
    appliedAt: "2026-06-15T04:00:00.000Z",
    status: "offer",
    pendingConfirmation: false,
    source: "browser",
    dedupeKey: null,
    companyBusiness: "短视频与直播",
    roleSummary: "推荐策略产品",
    companyCulture: null,
    rejectionReason: null,
  });
  insertInterviewItems.push(
    interview(offerId, 1, "video", "2026-06-20T06:00:00.000Z", "completed", { interviewer: "HR" }),
    interview(offerId, 2, "onsite", "2026-06-25T03:00:00.000Z", "completed", { interviewer: "业务负责人" }),
  );
  insertNoteItems.push(
    note(offerId, "follow_up", "Offer 已发，薪资 40K，等待正式 offer letter。"),
  );
  insertStatusEventItems.push(
    statusEvent(offerId, "applied", "screening", null, "2026-06-17T01:00:00.000Z"),
    statusEvent(offerId, "screening", "interviewing", null, "2026-06-19T02:00:00.000Z"),
    statusEvent(offerId, "interviewing", "offer", "HR 电话口头 offer", "2026-06-28T05:00:00.000Z"),
  );

  // 已拒绝
  const rejectedId = application({
    jdId: null,
    resumeId: null,
    companyName: "滴滴",
    roleName: "增长产品经理",
    jdTitleSnapshot: "出行增长产品",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "email_fill",
    targetUrl: "https://talent.didiglobal.com",
    appliedAt: "2026-07-05T08:00:00.000Z",
    status: "rejected",
    pendingConfirmation: false,
    source: "email",
    dedupeKey: null,
    companyBusiness: "出行服务",
    roleSummary: "用户增长产品",
    companyCulture: null,
    rejectionReason: "岗位关闭，名额收紧",
  });
  insertStatusEventItems.push(
    statusEvent(rejectedId, "applied", "screening", null, "2026-07-07T01:00:00.000Z"),
    statusEvent(rejectedId, "screening", "rejected", "岗位关闭，名额收紧", "2026-07-09T02:00:00.000Z"),
  );

  const rejectedId2 = application({
    jdId: null,
    resumeId: null,
    companyName: "小红书",
    roleName: "社区产品经理",
    jdTitleSnapshot: "社区互动产品",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "manual",
    targetUrl: null,
    appliedAt: "2026-07-28T05:00:00.000Z",
    status: "rejected",
    pendingConfirmation: false,
    source: "manual",
    dedupeKey: null,
    companyBusiness: "社区电商",
    roleSummary: "社区互动功能",
    companyCulture: null,
    rejectionReason: "经验方向与岗位不匹配",
  });
  insertStatusEventItems.push(
    statusEvent(rejectedId2, "applied", "rejected", "经验方向与岗位不匹配", "2026-07-30T01:00:00.000Z"),
  );

  // 无回应
  application({
    jdId: null,
    resumeId: null,
    companyName: "哔哩哔哩",
    roleName: "内容产品经理",
    jdTitleSnapshot: "社区内容产品经理",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "form_fill",
    targetUrl: "https://jobs.bilibili.com",
    appliedAt: "2026-07-01T03:00:00.000Z",
    status: "no_response",
    pendingConfirmation: false,
    source: "browser",
    dedupeKey: null,
    companyBusiness: "视频社区",
    roleSummary: "内容生态产品",
    companyCulture: null,
    rejectionReason: null,
  });

  application({
    jdId: null,
    resumeId: null,
    companyName: "网易",
    roleName: "用户研究经理",
    jdTitleSnapshot: "游戏用户研究",
    resumeTitleSnapshot: "数据产品经理简历",
    resumeContentHashSnapshot: null,
    deliveryMethod: "other",
    targetUrl: null,
    appliedAt: "2026-06-30T09:00:00.000Z",
    status: "no_response",
    pendingConfirmation: false,
    source: "other",
    dedupeKey: null,
    companyBusiness: "游戏与在线服务",
    roleSummary: "玩家行为研究",
    companyCulture: null,
    rejectionReason: null,
  });

  return items;
}

const insertInterviewItems = [];
const insertNoteItems = [];
const insertReminderItems = [];
const insertStatusEventItems = [];

app.setName("coolto-local-agent");

app.whenReady().then(() => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储不可用");
    }
    const dir = selectSyncDir();
    if (!dir) throw new Error("没有找到本地同步目录");
    const key = loadKey(dir);
    const codec = new PayloadCodec(key);
    const dbPath = path.join(dir, "local-sync.sqlite");
    const db = new DatabaseSync(dbPath);

    const applications = buildApplications();
    const count = {
      application: 0,
      application_status_event: 0,
      interview_round: 0,
      application_note: 0,
      reminder: 0,
    };

    for (const appItem of applications) {
      insertEntity(db, codec, "application", appItem.id, appItem);
      count.application += 1;
    }
    for (const item of insertInterviewItems) {
      insertEntity(db, codec, "interview_round", item.id, item);
      count.interview_round += 1;
    }
    for (const item of insertNoteItems) {
      insertEntity(db, codec, "application_note", item.id, item);
      count.application_note += 1;
    }
    for (const item of insertReminderItems) {
      insertEntity(db, codec, "reminder", item.id, item);
      count.reminder += 1;
    }
    for (const item of insertStatusEventItems) {
      insertEntity(db, codec, "application_status_event", item.id, item);
      count.application_status_event += 1;
    }

    db.close();
    process.stdout.write(
      `seeded into ${dir}\n${JSON.stringify(count, null, 2)}\n`,
    );
    app.exit(0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    app.exit(1);
  }
});
