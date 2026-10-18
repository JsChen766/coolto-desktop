# §10 本机材料库 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收勾选表

| 验收项 | 现状 | 证据 |
|--------|------|------|
| 可上传支持格式并见处理状态 | **满足**（本轮加固） | 对话框过滤 pdf/docx/txt/md/png/jpg/jpeg（去掉未接线的 webp）；文本导入 → `processingStatus=completed` + 未归类；图片 → `queued`/`unprocessed`；列表/筛选含「等待 OCR」「处理中」「未归类」；契约 `§10 upload…` + UI contract |
| 材料↔Experience 关联可查；删除前有影响说明 | **满足**（本轮加固） | `MaterialView.relatedExperienceIds` 可查多经历；详情面板「关联经历」；`MaterialDeleteImpactService.preview` + `MaterialImpactPreview` 列出受影响 Experience/引用数；关系提案审批见 `material-product-relations`；契约 `§10 material↔Experience…` |
| OCR 低置信标记；原样投递件未经授权不解析入库 | **满足**（本轮加固） | 低置信 → `needs_confirmation` + UI「OCR 需要确认」；`MaterialImportService` 在 **parse 前** `assertMaterialIntakeAuthorized`；无 `materialIntent` 时 `not_material_authorized` 且 `parseCalls=0`、仓库空；有授权可入库；仓库 COW 对已授权 `delivery_resume` 持久化放行（修复 restore/import 潜在断点） |

## 本轮改动（缺口补齐）

1. `src/material/material-import-service.ts`：`delivery_resume` 须授权，拒绝发生在解析之前。
2. `src/material/material-repository-helpers.ts`：持久化路径对已标记 `delivery_resume` 带 `materialIntent` 再 normalize（与 export-restore 一致）。
3. `src/material/material-view.ts` + desktop types：暴露 `relatedExperienceIds`。
4. UI：详情关联经历；状态筛选补「等待 OCR / 处理中」；导入对话框去掉 webp。
5. 测试：`test/material-oss-section-10.test.ts` + navigation UI 契约扩展。

## 命令证据

```text
unset NPM_CONFIG_PREFIX; nvm use 22
node --import tsx --test --test-concurrency=1 \
  test/material-oss-section-10.test.ts \
  test/material-product-navigation.test.ts \
  test/material-product-import.test.ts \
  test/material-product-impact.test.ts \
  test/material-product-ocr.test.ts \
  test/material-product-relations.test.ts \
  test/material-core.test.ts \
  test/material-product-export-restore.test.ts \
  test/material-product-file-boundary.test.ts \
  test/delivery-resume-file-tools.test.ts
# pass 51（见 material-unit-tests.log）
```

证据中无 `.env` / API Key 明文。未 push。

## 残留弱点

- 完整 Electron GUI 点通（材料库上传→OCR→关联→删除预览）依赖本机桌面；本轮以单元/契约测试为主，未在无显示 box 上跑 UI QA。
- `MaterialImportService` 授权提升 `delivery_resume` 为材料库条目后，仍会走解析；日常「原样投递」应继续用独立投递简历仓库（`save_selected_file_as_delivery_resume`），勿误走材料导入。
- 仓库持久化对已标 `delivery_resume` 的记录在 COW 时自动带 `materialIntent`；入口闸仍在 import / normalize 调用方，宿主内部 `save` 属受信路径。
- 详情「关联经历」仅展示 ID 列表，无跳转经历编辑器的深链（可后续增强）。
