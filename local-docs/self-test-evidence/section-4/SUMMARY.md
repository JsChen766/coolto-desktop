# §4 本机隐私与数据控制 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收项对照

| 验收项 | 现状 | 本轮改动 |
|--------|------|----------|
| 设置中有「导出本机数据」「清除本机数据」；文案与行为一致 | `PrivacyDataSection.vue` local-only 导出/清除 | 沿用上一轮 |
| 完整导出包数量/关系与 UI 可见资产对应 | 夹具：experience×2 / jd×1 / resume×1 / application×1 + local conversations/drafts/tasks；manifest.counts 与 entries 对齐；relationshipCount=3 | 是（新增 reconciliation 夹具测试） |
| 敏感字段脱敏仍成立 | `assertSafeExportValue` 拒绝 `api_key` 等；解密后 payload 无 `ownerId`/`access_token`/`passphrase` | 是（夹具断言） |
| 清除后无「假装删了云」文案；隐私同意版本可重确认 | `privacy-2026-10-18-v1` + UI 文案 | 沿用 |

## 命令证据

```text
node --import tsx --test --test-concurrency=1 \
  test/privacy-export-reconciliation.test.ts \
  test/privacy-export-crypto.test.ts
# pass（含 manifest 对账 + 禁止字段）
node --import tsx --test test/privacy-ui-contract.test.ts
# pass
```

详见 `export-reconciliation.log` / `privacy-tests.log`。证据中无密钥明文。
