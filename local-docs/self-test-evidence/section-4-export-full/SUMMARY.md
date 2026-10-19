# §4 完整导出路径 — 自测证据（2026-10-19 Asia/Shanghai）

对照 PRD §4.1 / §4.3：导出本机业务数据；完整导出包数量/关系与 UI 可见资产对应。

## 本轮补齐点

此前 `section-4/` 仅为 **夹具级** `buildExportPackage` 对账（见该目录 SUMMARY）。本轮把路径拉到：

`DataExportService.export` →（假）保存对话框选定路径 → **原子写盘** → 解密 payload → manifest counts / relationships 对账。

并修复开源 Desktop 缺口：设置里「导出本机数据」默认 `includeCloudAssets=false`，原先不会带上经历/JD/简历/Application；现从本机 sync store 投影为 `local-business/*` 快照（`localOnly: true`，`mode: offline_stale`，`scope.cloudAssets: false`）。

## 命令

```bash
# 需 Node >= 22.13（本机用 nvm v22.23.3）
node --import tsx --test --test-concurrency=1 \
  test/privacy-export-full-path.test.ts \
  test/privacy-export-reconciliation.test.ts \
  test/privacy-export-crypto.test.ts \
  test/privacy-export-form.test.ts \
  test/privacy-export-dialog.test.ts \
  test/privacy-ui-contract.test.ts \
  test/privacy-ipc-validation.test.ts
```

日志：`export-full-path.log`（20 pass / 0 fail）。

## 用例结论

| 用例 | 结论 |
|------|------|
| 云端快照路径：写盘 + 解密 + experience/jd/resume/application + local_* counts | **PASS** |
| OSS 本机路径：sync 业务资产 + 可选对话/草稿/任务；禁止字段剥离；关系数=3 | **PASS** |
| 保存对话框取消 → `cancelled`，不写文件 | **PASS** |
| `buildLocalBusinessSnapshot` 跳过 delete、剥离 `owner_id` | **PASS** |
| 既有 reconciliation / crypto / form / dialog / UI / IPC | **PASS** |

## 产物 / 代码入口

| 路径 | 说明 |
|------|------|
| `test/privacy-export-full-path.test.ts` | 完整写盘路径对账 |
| `src/desktop/main/privacy/local-business-export-snapshot.ts` | 本机 sync → 快照 |
| `src/desktop/main/privacy/data-export-service.ts` | 无云时走本机业务快照 |
| `src/desktop/main/privacy/electron-export-save-dialog.ts` | 从 service 拆出的 Electron 对话框（便于单测不加载 electron） |
| `src/desktop/main/privacy/privacy-host.ts` | 接线 localBusiness reader |
| `src/privacy/export-package.ts` / `export-canonical.ts` | `snapshotEntriesLocalOnly` |

临时导出文件写在 OS temp（测完删除）；证据目录**不含**真实密钥或用户业务正文。

## 限制（诚实记录）

1. **原生「另存为」对话框**依赖 Electron `dialog.showSaveDialog`，CDP 无法稳定点选；本轮以可注入的 `ExportSaveDialog` 对账到磁盘，等价覆盖主进程导出写盘路径。完整「人手点设置 → 导出 → 系统对话框」仍需人工或 OS 级 UI 自动化。
2. Linux unpacked GUI 冷启动 / Win·Mac 真机打包不在本轮范围（见缺口摸底）。
3. 本机业务快照关系推导：application↔jd/resume；resume.experienceIds↔experience。其他实体类型未纳入。

## 总评

**PASS**（完整导出服务写盘路径可复现；OSS 本机业务资产已进入导出包并对账）。
