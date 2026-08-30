# B6：集成交付

> 状态：已停止作为独立阶段推进；范围由
> [Browser Enhance 路线](../../browser-enhance/README.md) BE4、BE5、BE8 吸收
> 前置：B1–B5 全部通过阶段质检

## 目标

将 B1–B5 的独立模块串联为一条完整的端到端投递工作流；补全用户从「看到 JD」到「完成填写」的完整路径；为未来投递追踪路线预留投递记录 Hook；完成全路线真实账号验收。

---

## 核心产物

### 端到端用户路径

**路径 A：从 JD URL 开始**

```text
用户在浏览器打开 JD 页面
  → 「提取此 JD」→ 确认入库
  → Agent 询问：是否要生成简历并投递？
  → 用户确认 → 生成简历（调用 G1–G7）
  → Agent 询问：投递方式？
     ├── 网站填表 → 用户导航到申请页面 → 「识别表单」→ 审批 FillProposal → 填写
     └── 发邮件   → 用户导航到 Webmail → 「填写邮件」→ 审批 EmailFillProposal → 填写
  → 用户手动提交/发送
  → App 显示：「投递完成，已记录」
```

**路径 B：从已有 JD 和简历开始**

```text
用户在聊天中指定已有 JD 和简历
  → Agent 直接询问：投递方式？
  → 后续流程同路径 A 的投递方式分支
```

### 投递意图记录（Application Tracker Hook）

用户完成填写并手动提交后，App 询问：「是否记录此次投递？」用户确认后，创建一条 `DeliveryIntent` 记录（本地存储，不上云），供未来 Application Tracker 路线读取。

```typescript
interface DeliveryIntent {
  id: string;
  jdId: string;
  resumeArtifactId: string;
  deliveryMethod: 'form_fill' | 'email_fill';
  targetUrl: string;
  recordedAt: string;
  note?: string;
}
```

此结构是预留接口，当前不展示投递看板，只存储。

### 主进程

| 文件 | 职责 |
|------|------|
| `browser/delivery-intent-store.ts` | 本地 JSON 文件存储 `DeliveryIntent[]`，按用户隔离 |

### Renderer

| 文件 | 职责 |
|------|------|
| `components/DeliveryCompleteCard.vue` | 填写完成后在聊天流出现的完成卡片：显示公司/岗位/投递方式/时间；询问「记录此次投递？」（是/否）；不显示看板入口（追踪路线负责） |

---

## Agent 对话节点设计

在系统提示词（`system-prompt.ts`）补充浏览器路线的工作流节点描述：

1. **JD 提取后**：询问是否生成简历，或直接投递（如已有简历）
2. **简历确认后**：询问投递方式（网站填表 / 发邮件 / 暂不投递）
3. **填写完成提示**：告知用户手动提交，询问是否记录投递
4. **异常提示**：验证码 / 不支持的表单 / 附件上传失败，给出清晰下一步指引

---

## 验收矩阵

### 真实账号主路径（全部必须在真实 Electron 完成）

| # | 验收项 | 投递方式 |
|---|--------|---------|
| 1 | 浏览器打开 Boss 直聘 JD 页面 → 提取 JD → 确认入库 → 在 App 内查看 JdDetailPanel | — |
| 2 | 从 JD 入库自动续接生成简历（Direction A 复用） | — |
| 3 | 在 Boss 直聘申请页识别表单 → 生成 FillProposal → 修改一个字段 → 确认执行 → 各字段正确填入 | 网站填表 |
| 4 | 验证码出现时自动暂停，用户手动通过后继续填写 | 网站填表 |
| 5 | 在 Gmail 撰写界面 → 生成 EmailFillProposal → 修改主题 → 确认执行 → Subject/Body/PDF 附件正确 | 邮件填写 |
| 6 | 完成填写后 DeliveryCompleteCard 出现，用户选择「记录」后 DeliveryIntent 正确存储 | 两种都测 |
| 7 | 浏览器关闭再打开，Boss 直聘 / Gmail 登录状态保留 | — |
| 8 | 整个路径中 `npm run check` 持续通过 | — |

### 失败与恢复路径

| 场景 | 预期行为 |
|------|---------|
| 表单页面字段无法识别（L3 兜底） | 未匹配字段高亮，面板显示建议值，用户手动填写后继续 |
| 字段注入失败（元素消失/禁用） | 标记 failed，继续填写其余字段，面板明确显示失败字段 |
| 用户中止填写 | 已填字段保留，未填字段不处理，面板显示中止状态 |
| 附件上传失败 | 标记 requiresManual，面板提示手动上传，不阻断其余字段 |
| 浏览器窗口意外关闭 | FillProposal 保留在 ProposalStore，可重新打开浏览器后继续 |

---

## 本阶段不做

- 投递追踪看板 UI（追踪路线）
- 邮件确认信自动扫描识别（追踪路线）
- 面试提醒（追踪路线）
- 多步骤表单跨页面自动识别（后续增强）

---

## 完成门槛

- 验收矩阵 8 项主路径全部通过
- 失败恢复路径 5 项全部验证
- `npm run check` 通过（含 Node typecheck + Vue typecheck + build + 单测）
- 新增业务文件无超 250 行
- 本文档状态更新为「已完成」，`local-docs/prd-requirements-tracker.md` 中浏览器模块状态同步更新
