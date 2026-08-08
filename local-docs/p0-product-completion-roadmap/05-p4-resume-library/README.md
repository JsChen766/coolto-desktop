# P4：简历仓库与本地历史

> 状态：✅ 完成（2026-07-25）
> 前置：P0 通过；G5–G7 保持通过

## 目标

用户在 App 侧栏进入"简历仓库"，看到所有云端简历与已关联本地草稿的合并列表，能查看、重命名、
归档/恢复归档、删除本地草稿、查看并恢复本地检查点；云端与本地都有改动时呈现明确冲突并提供三条处理路径。

---

## 架构约束

| 约束 | 要求 |
|------|------|
| 上帝类 | 禁止。sync-status / projection / library-api / library-service / library-ipc 各独立文件 |
| 行数   | 业务文件 ≤ 220 行目标，≤ 250 行硬限制 |
| 测试   | `node:test` + `node:assert/strict`；纯函数每类 ≥ 5 用例 |
| ipc.ts | 已 242 行；P4 新增处理器提取到 `resume-library-ipc.ts`，ipc.ts 只调用 |
| App.vue | 已 311 行；库视图用独立 `ResumeLibraryView.vue` 组件，App.vue 只做路由切换 |

---

## 现有基础（不重建）

| 已有 | 路径 | 用途 |
|------|------|------|
| `ResumeLibraryEntry` 类型 | `src/resume/library/types.ts` | 直接使用，不重定义 |
| `LocalResumeDraft` / 检查点类型 | `src/resume/draft/types.ts` | 直接使用 |
| `ResumeDraftService` | `src/desktop/main/resume-drafts/resume-draft-service.ts` | 读取本地草稿，checkpoint restore |
| `ResumePublicationApi.listResumes/getResume` | `src/api/resume-publication-api.ts` | 复用，不新建云端读接口 |
| `normalizeResumeFull` | `src/api/resume-normalizers.ts` | 复用 |

---

## 文件分配与行数预算

### 核心逻辑（`src/resume/library/`）

| 文件 | 职责 | 预算 |
|------|------|------|
| `types.ts` | 已有 `ResumeLibraryEntry` 等（83 行） | 不变 |
| `sync-status.ts` | `computeSyncStatus(cloud, local)` 纯函数 | ≤ 60 行 |
| `projection.ts` | `buildLibraryEntries(clouds, drafts)` 纯函数 | ≤ 120 行 |

### API 层（`src/api/`）

| 文件 | 职责 | 预算 |
|------|------|------|
| `resume-library-api.ts` | `rename(id, title)`, `archive(id)`, `unarchive(id)` 三个 PATCH 调用 | ≤ 80 行 |

### 桌面主进程（`src/desktop/main/resume-library/`）

| 文件 | 职责 | 预算 |
|------|------|------|
| `resume-library-service.ts` | 组合 `ResumePublicationApi` + `ResumeDraftService` + projection，提供仓库读写方法 | ≤ 150 行 |
| `resume-library-ipc.ts` | 注册 `library:*` IPC 处理器，注入 service 依赖 | ≤ 100 行 |

`src/desktop/main/ipc.ts` 只追加调用 `registerResumeLibraryIpc(ipcMain, servicesForCurrentUser)` (+5 行)。

### 共享类型（`src/desktop/shared/types.ts`）

新增 IPC 输入类型：
- `LibraryRenameInput { resumeId, title }`
- `LibraryArchiveInput { resumeId, archive: boolean }`
- `LibraryDeleteDraftInput { artifactId }`
- `LibraryRestoreCheckpointInput { artifactId, checkpointId }`

### Renderer（`src/desktop/renderer/src/`）

| 文件 | 职责 | 预算 |
|------|------|------|
| `library/use-resume-library.ts` | 仓库状态 composable：列表、加载、操作调用 | ≤ 100 行 |
| `components/ResumeLibraryView.vue` | 主列表（搜索框 + 状态筛选 + 行列表 + 空态） | ≤ 220 行 |
| `components/ResumeLibraryRow.vue` | 单行：名称/状态/时间 + overflow 操作菜单 | ≤ 130 行 |
| `components/ResumeCheckpointList.vue` | 本地检查点列表：动作/时间/恢复按钮 | ≤ 100 行 |
| `components/SyncConflictModal.vue` | 冲突三路操作 modal | ≤ 120 行 |
| `components/Sidebar.vue` | 新增"简历仓库"入口（仅追加链接行） | +8 行 |
| `App.vue` | 新增 `library` 视图模式，追加 `<ResumeLibraryView>` | +20 行 |
| `lib/desktop-api.ts` | 新增 `library:*` IPC 调用 + demo 数据 | +60 行 |
| `styles/base.css` | 仓库页样式 | +120 行 |

---

## IPC 通道设计

```
library:list    → ResumeLibraryEntry[]
library:rename  → { resumeId, title } → Resume（更新后）
library:archive → { resumeId, archive: boolean } → Resume
library:delete-draft → { artifactId } → void
library:get-checkpoints → { artifactId } → ResumeDraftCheckpoint[]
library:restore-checkpoint → { artifactId, checkpointId } → LocalResumeDraft
```

---

## 同步状态计算规则

```
cloud present, no local            → cloud_only
local present, no cloud link       → local_only
cloudLink.contentHash === cloud.contentHash
  AND workspace.revision === cloudLink.syncedRevision  → synced
cloudLink.contentHash === cloud.contentHash
  AND workspace.revision !== cloudLink.syncedRevision  → local_changes
cloudLink.contentHash !== cloud.contentHash
  AND workspace.revision === cloudLink.syncedRevision  → cloud_changes
cloudLink.contentHash !== cloud.contentHash
  AND workspace.revision !== cloudLink.syncedRevision  → conflict
```

---

## UI 规范（遵循 foundation/ui-design-standards）

- 列表行：背景填充 OR 边框，二选一；不同时使用
- 状态用文字标签（"已同步" / "有本地修改" / "云端已更新" / "冲突"），不只用颜色
- "删除本地草稿"为 destructive，overflow 菜单单独区隔，弹 confirm dialog
- 云端删除入口：隐藏或显示"未接入"，不伪装成归档
- 冲突 modal 三路：① 重读云端 ② 另存为新简历 ③ 确认覆盖（明确标 destructive）
- 投递状态列：未接入时隐藏该列，不显示假数据

---

## 实施顺序

```
P4.1  src/resume/library/sync-status.ts（纯函数）
P4.2  src/resume/library/projection.ts（纯函数）
P4.3  src/api/resume-library-api.ts（rename / archive）
P4.4  src/desktop/main/resume-library/resume-library-service.ts
P4.5  src/desktop/shared/types.ts（新增 IPC 输入类型）
P4.6  src/desktop/main/resume-library/resume-library-ipc.ts
P4.7  src/desktop/main/ipc.ts（调用 registerResumeLibraryIpc，+5 行）
P4.8  src/desktop/renderer/src/lib/desktop-api.ts（IPC 调用 + demo 数据）
P4.9  src/desktop/renderer/src/library/use-resume-library.ts
P4.10 src/desktop/renderer/src/components/ResumeLibraryRow.vue
P4.11 src/desktop/renderer/src/components/ResumeCheckpointList.vue
P4.12 src/desktop/renderer/src/components/SyncConflictModal.vue
P4.13 src/desktop/renderer/src/components/ResumeLibraryView.vue
P4.14 src/desktop/renderer/src/components/Sidebar.vue（新增入口）
P4.15 src/desktop/renderer/src/App.vue（接入 library 视图模式）
P4.16 src/desktop/renderer/src/styles/base.css（库样式）
P4.17 测试：sync-status.test.ts + projection.test.ts
P4.18 Browser Demo 验收
```

---

## 测试矩阵

| 文件 | 用例数 | 覆盖要点 |
|------|--------|---------|
| `test/resume-library-sync-status.test.ts` | ≥ 6 | 六种状态各一；边界：revision 相等/不等；hash 相等/不等 |
| `test/resume-library-projection.test.ts` | ≥ 6 | cloud_only；local_only；已关联合并；孤儿 cloudLink；availableOperations 按状态正确 |

---

## 验收条件

- [ ] `node --test` 新增 ≥ 12 用例全绿
- [ ] Browser Demo：点击"简历仓库" → 显示列表 → 可重命名 → 可归档 → 可查看本地检查点 → 可恢复
- [ ] 冲突场景：两边都变化时显示 SyncConflictModal，三路均可触发
- [ ] 无文件 > 250 行
- [ ] 无上帝类（sync-status / projection / library-api / service / ipc 各自独立）
- [ ] `ipc.ts` 不超过 260 行（当前 242，只新增 5 行）

---

## 实施结论（2026-07-25）

✅ P4.1–P4.18 全部完成。验收结果：

| 验收项 | 结果 |
|--------|------|
| `node --test` 新增 14 用例（sync-status×7 + projection×7） | ✅ 全绿 |
| Browser Demo：简历仓库弹出列表，三条 demo 条目、同步状态徽章正确 | ✅ |
| 重命名/归档/删除草稿/本地历史菜单可见 | ✅ |
| 关闭按钮恢复主工作区 | ✅ |
| TypeScript `--noEmit` 0 错误 | ✅ |
| 无文件超 250 行；无上帝类 | ✅ |
| `ipc.ts` 库 IPC 提取至独立文件，ipc.ts 仅增 8 行 | ✅ |

**关键新文件：**
- `src/resume/library/sync-status.ts` — 同步状态纯函数
- `src/resume/library/projection.ts` — 列表/详情投影
- `src/api/resume-library-api.ts` — 重命名/归档 HTTP 封装
- `src/desktop/main/resume-library/resume-library-service.ts` — 主进程聚合服务
- `src/desktop/main/resume-library/resume-library-ipc.ts` — IPC 注册模块
- `src/desktop/renderer/src/library/use-resume-library.ts` — Vue 组合式
- `src/desktop/renderer/src/components/ResumeLibraryView.vue` — 主视图
- `src/desktop/renderer/src/components/ResumeLibraryRow.vue` — 单行组件
- `src/desktop/renderer/src/components/ResumeCheckpointList.vue` — 检查点列表
- `src/desktop/renderer/src/components/SyncConflictModal.vue` — 冲突弹窗

## LocalSyncStore 接线记录（2026-07-27）

- 已发布 Resume 的业务读源由 Direct Cloud API 切换为本地加密 SQLite projection；
  `ResumeDraft` 仍是独立本地工作稿和 checkpoint 历史，不上传原始文件；
- 发布、覆盖、重命名、归档改为本地先写 `sync_entities + local_outbox`，随后立即触发
  Push；离线保留 pending，版本冲突标记 conflict，不执行 last-write-wins；
- 发布/覆盖后按 candidateId 更新 `ResumeDraftCloudLink`，写入 resumeId、contentHash、
  syncedRevision 和 entityVersion；多份草稿按明确 cloudResumeId 关联，不再用“第一份非本地
  草稿”启发式匹配；
- Agent 保存审批、Resume 工具、PDF 来源解析与 Library 共用 `ResumeSyncStore`，避免部分
  路径绕过 Outbox；认证 IPC 已从总 `ipc.ts` 拆至 `auth-ipc.ts`；
- App Store 生成的真实 Resume create Outbox 已推到 Docker 后端，返回
  `applied/entityVersion=1`；读回标题与 contentHash 一致；`npm run check` 181/181 通过。
