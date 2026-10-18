# §4 本机隐私与数据控制 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收项对照

| 验收项 | 现状 | 本轮改动 |
|--------|------|----------|
| 设置中有「导出本机数据」「清除本机数据」；文案与行为一致 | `PrivacyDataSection.vue` 增加导出入口（`local-only`）；清除文案改为仅本机 | 是 |
| 完整导出包数量/关系与 UI 可见资产对应 | 既有 `DataExportService` + 加密包；设置默认 `localOnly` | 否（沿用实现；UI 入口补齐） |
| 清除后对话/草稿/任务/缓存按说明移除；无「假装删了云」文案 | `executeLocalClear` 既有；UI 去掉「云端资产保留」误导 | 是（文案） |
| 隐私同意含版本与时间；升级政策可触发重确认 | 版本 bump 至 `privacy-2026-10-18-v1`（major）+ 新 contentHash | 是 |

## 关键路径

- `src/privacy/policy.ts` / `src/privacy/types.ts`
- `src/desktop/renderer/src/components/PrivacyDataSection.vue`
- `src/desktop/renderer/src/i18n/catalog-privacy.ts`

## 命令

见 `privacy-tests.log`（期望 pass）。
