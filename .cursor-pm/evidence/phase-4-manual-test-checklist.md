# Phase 4 手测 / 验收清单（草案）

> **Gate authority:** `prd-privacy`（2026-09-12 post-merge）；开发参考 `prd-app-closure`。自动化优先复用 `qa:phase-2`、`run-material-product-acceptance.mjs`、resume runtime acceptance。

## C1 共享宿主 / 材料库

- [ ] 主窗口设置或导航可打开材料库（非仅独立 feature 窗口）
- [ ] 导入 / OCR / 关系提案 / 删除影响 走主进程 MaterialHostPort
- [ ] Agent 材料工具在真实会话可调用（非 fixture-only）

## C2 Mail / 投递 / 站点

- [ ] Mail 连接 UI + IPC 与 `user-services.mailConnections` 一致
- [ ] Application 投递 / Browser 填表 loop 与 harness 场景（自动化：`npm run qa:browser-agent`）
- [ ] 招聘站识别 / takeover 恢复（fixture + 可选真站 U）
- [x] Inbox 投递/面试审批卡 UI fixture（`qa:phase-2:ui` / `[C2-A3]`）
- [ ] `npm run qa:phase-4-c2` 全链路本地跑通

## C3 Tier2 / 收口

- [x] `npm run qa:phase-4-c3`（Node Tier2 映射，196 tests）
- [x] `npm run qa:phase-4-c2`（全链 Electron，2026-09-12）
- [x] `run-resume-runtime-acceptance.mjs`（2026-09-12 PASS，合成路径；真模型 600s 仍 U）
- [ ] `COOLTO_C3_ANA_BACKEND=1` + D₁ DB acceptance（Docker）
- [x] `npm run check`（closure，2026-09-12）
- [x] `node scripts/run-material-product-acceptance.mjs`（2026-09-12 PASS）
- [ ] Phase 2 搁置项（A4-cold、B2–B3、C4）+ PLAT 200%/崩溃恢复
