import { app } from "electron";

import { loadLocalEnv } from "../config.js";
import type { ExperienceCreateInput } from "../api/experience-types.js";
import { createUuidV7 } from "../sync/uuid-v7.js";
import { ElectronAuthSessionStore } from "../desktop/main/electron-auth-session-store.js";
import { LocalSyncStore } from "../desktop/main/sync/local-sync-store.js";
import { createProfileLocalPayloadMerger } from "../desktop/main/profile/profile-local-sync-adapter.js";
import {
  buildLocalExperience,
  toExperienceWritePayload,
} from "../desktop/main/experience-library/experience-sync-mapping.js";
import { assertAssetCapacity, countLiveAssets } from "../desktop/main/asset-capacity.js";

const API_BASE = "http://127.0.0.1:8080";

const SEED: ExperienceCreateInput[] = [
  {
    idempotencyKey: "qa-seed-orbit-data-analyst",
    category: "work",
    title: "数据分析工程师",
    organization: "Orbit Commerce",
    role: "Data Analyst",
    startDate: "2022-03",
    endDate: "2025-08",
    tags: ["SQL", "Python", "AB测试", "漏斗分析"],
    revisionSource: "manual",
    content: [
      "负责日活 200 万电商 App 的核心指标看板，用 SQL 对订单/埋点宽表建模，支撑周报与 ad-hoc 分析。",
      "用 Python（pandas + scipy）做注册→激活→首单漏斗分析，定位激活页流失环节并推动产品改版。",
      "独立设计 AB 实验：假设优化 onboarding 文案可提升激活率；50/50 分流、样本量 n≈12 万、显著性 p<0.05，激活率 +12%，实验日志与 notebook 可回溯。",
    ].join("\n"),
  },
  {
    idempotencyKey: "qa-seed-city-growth-lab",
    category: "project",
    title: "增长实验平台",
    organization: "City Data Lab",
    role: "分析负责人",
    startDate: "2023-06",
    endDate: "2024-02",
    tags: ["Python", "漏斗分析", "SQL"],
    revisionSource: "manual",
    content: [
      "搭建实验配置与指标回收流水线，Python 产出实验分析与业务洞察报告。",
      "漏斗环节：曝光→点击→注册→留存；用 SQL 抽取 cohort 并输出 notebook 片段供研发复现。",
    ].join("\n"),
  },
  {
    idempotencyKey: "qa-seed-nova-intern-analytics",
    category: "education",
    title: "应用统计与数据挖掘",
    organization: "华东理工大学",
    role: "硕士",
    startDate: "2019-09",
    endDate: "2022-06",
    tags: ["统计", "Python"],
    revisionSource: "manual",
    content:
      "主修回归分析、实验设计；毕业设计用 Python 完成用户行为聚类与可视化，GPA 3.6/4.0。",
  },
];

async function createOne(
  store: LocalSyncStore,
  input: ExperienceCreateInput,
): Promise<void> {
  const identity = input.idempotencyKey
    ? store.resolveCreateIdentity(
        "experience",
        input.idempotencyKey,
        (() => {
          const { idempotencyKey: _k, ...request } = input;
          return request;
        })(),
      )
    : { entityId: createUuidV7(), operationId: createUuidV7() };
  const existing = store.getEntity("experience", identity.entityId);
  if (existing && existing.operation !== "delete") return;

  assertAssetCapacity("experience", countLiveAssets(store.listEntities("experience")));
  const entityId = identity.entityId;
  const revisionId = createUuidV7();
  const operationId = identity.operationId;
  const now = new Date().toISOString();
  store.enqueue({
    operationId,
    entityType: "experience",
    entityId,
    action: "create",
    expectedVersion: null,
    payload: toExperienceWritePayload(input, revisionId),
    localPayload: buildLocalExperience(entityId, revisionId, input, now),
  });
}

async function run(): Promise<void> {
  await app.whenReady();
  loadLocalEnv();
  const session = await new ElectronAuthSessionStore(API_BASE).load();
  if (!session?.currentUser?.id) {
    throw new Error("run run-dev-desktop-login.mjs first");
  }
  const store = await LocalSyncStore.open(
    API_BASE,
    session.currentUser.id,
    createProfileLocalPayloadMerger,
  );
  for (const input of SEED) await createOne(store, input);
  const total = store.listEntities("experience").filter((e) => e.operation !== "delete").length;
  console.log(`QA_EXPERIENCE_SEED_OK totalActive=${total}`);
  app.quit();
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
