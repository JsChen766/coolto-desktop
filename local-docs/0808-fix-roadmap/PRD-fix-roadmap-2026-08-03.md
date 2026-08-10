# Coolto App — 修复 PRD（Roadmap v3 实测反馈）

> **文档类型**：产品需求文档（修复向）
> **版本**：v1.0
> **日期**：2026-08-03
> **测试基线**：`b8b1457` / 分支 `app`
> **发布判定**：**NO-GO**
> **目标读者**：前端开发、后端开发

---

## 1. 概述

本文档基于 2026-08-03 对 Coolto App Roadmap v3 的全功能测试审计，将测试中发现的缺陷和功能缺口转化为面向开发的修复需求。每条需求包含**问题截图、复现路径、期望行为、验收条件**。

### 1.1 全局判定

本轮测试**工程质量门禁全部通过**（316/316 单测、零类型错误、构建成功），但存在 **2 个 P0 阻断**和 **6 个 P1 缺口**，必须修复后才能发布。

### 1.2 优先级定义

| 级别 | 含义 | 发布要求 |
|------|------|----------|
| **P0** | 核心价值链断裂，用户无法完成主任务 | 必须修 |
| **P1** | 核心功能缺失或体验严重受损 | 必须修 |
| **P2** | 体验问题，不影响核心链路可用 | 建议修，可延后 |

### 1.3 已验证 PASS 的模块（不纳入修复范围）

以下模块本轮测试通过，**不需要修复**：

- 工程质量：316 单测全过，零类型错误，构建成功
- 会话恢复：关闭重开约 3.2 秒恢复到主界面
- 聊天基础：Markdown 渲染、附件选择/移除、流式输出、停止生成
- 经历仓库：搜索、筛选、TXT 简历解析审批（接受/拒绝/自定义）
- JD 解析与匹配分析：结构化预览、四维评分、权重公式正确
- 浏览器基础：多标签、URL 导航、前进/后退、刷新
- 自动填表安全边界：写权限审批卡、Overlay 逐字段审核、永不点击提交按钮
- 投递追踪：看板/时间轴/日历三视图、状态枚举与流转约束
- 多语言/主题：中英文和深浅色即时切换

---

## 2. P0 — 必须修复（发布阻塞）

### P0-1：JD → 针对性简历生成被证据 offset 校验阻断

| 字段 | 内容 |
|------|------|
| **Bug ID** | BUG-R5-RESUME-GEN-01 |
| **模块** | R5 — JD/匹配/简历 |
| **严重度** | P0 |
| **状态** | FAIL |

**问题描述**

用户选择目标 JD 后，系统应从经历库选择有来源证据的经历，生成可预览、可编辑、可审批的针对性简历。但当前 Agent 无法稳定获得精确的 UTF-16 偏移量（`sourceStart`/`sourceEnd`），触发「工具调用出现问题」错误，并进入**自行计算 → 校验失败 → 重试 → 失败**的死循环，最终无法生成简历候选，永远无法进入 `ready_for_approval` 状态。

**影响范围**

核心价值链（JD → 简历 → PDF → 投递）被完全阻断。这是本轮测试中唯一的 P0。

**截图证据**

![JD-14-resume-generation-tool-error.png](../evidence/screenshots/R5/JD-14-resume-generation-tool-error.png)

**复现步骤**

1. 进入「求职仓库」
2. 选择一条已有 JD（如「高级前端开发工程师」）
3. 触发「生成针对性简历」
4. 观察 Agent 输出

**期望行为**

- Agent 不自行计算 `sourceStart`/`sourceEnd`
- `get_resume_source_snapshot` 返回完整 `availableEvidence`（含稳定 `bulletId`、`quote`、`sourceStart`、`sourceEnd`）
- `prepare_resume_candidate` 接受 `quote`/`bulletId` 后，由宿主（而非 Agent）校验或解析 offset
- 校验失败最多一次结构化重试，之后展示面向用户的可读错误（而非内部 offset 细节），并允许用户手动重试
- 同一隔离数据集可到达 `ready_for_approval`，显示 A4 预览、Pending Change、保存审批和 PDF 导出审批

**验收条件**

1. `get_resume_source_snapshot` 返回可持久引用的完整 `availableEvidence`
2. `prepare_resume_candidate` 不依赖 Agent 自行计算 offset
3. 最多 2 次重试后必须生成 `ready_for_approval` 或展示可重试错误
4. 失败时显示用户可理解的错误信息，不循环播报内部 offset
5. 使用同一 JD/经历数据，可以最终到达 A4 预览和 PDF 导出

**涉及技术面**

- 前端：简历生成管线的错误展示、`ready_for_approval` 状态转换
- 后端/Agent 工具：`get_resume_source_snapshot` 的 offset 传递、`prepare_resume_candidate` 的证据校验逻辑

---

### P0-2：投递追踪缺少 Webmail 自动检测，无法自动更新投递状态

| 字段 | 内容 |
|------|------|
| **Bug ID** | GAP-P0-WEBMAIL-01 |
| **模块** | R9 — 投递追踪 |
| **严重度** | P0 |
| **状态** | GAP |

**问题描述**

当前投递追踪模块仅支持手动管理投递记录。产品设计中 Webmail（Gmail/QQ/163）已发送/收件箱 DOM 解析 → LLM 分类 → 看板自动建议状态更新的完整引擎**完全未实现**。用户必须手动在邮箱和 Coolto 之间来回切换、逐条录入投递进展，投递追踪自动化的核心依赖缺失。

**影响范围**

投递追踪从「自动追踪」退化为「手工记账」，用户的真实投递行为和 Coolto 中的记录极易脱节。这是**功能缺失**，不是体验问题。

**截图证据**

![TRK-19-auto-mail-detection-not-present.png](../evidence/screenshots/R9/TRK-19-auto-mail-detection-not-present.png)

**复现步骤**

1. 进入投递追踪看板
2. 观察是否有「自动扫描邮箱」或「检测已发送邮件」入口
3. 代码审查：Agent 工具中存在 `scan_inbox`/`detect_sent_mail` 类工具

**期望行为**

Webmail DOM 邮件检测引擎需要实现以下能力：

- **已发送检测**：用户在 Gmail/QQ/163 已发送页面时，Agent 可解析邮件 DOM，识别收件人公司、岗位名称、发送时间，提示用户是否创建或更新投递记录
- **收件箱检测**：识别面试邀请、Offer、拒信等邮件类型，分类后建议看板状态更新（如收到面试邀请 → 建议从「已投递」流转到「面试中」）
- **安全约束**：**永不自动点击发送/提交按钮**，仅做 DOM 读取和分类建议

**验收条件**

1. Gmail 已发送页面可被 Agent 识别并解析出投递相关邮件
2. 识别出的邮件可提示用户一键创建/更新投递记录
3. QQ 邮箱和 163 邮箱至少在 1 家上完成端到端验证
4. 永不自动发送邮件或点击提交按钮

**涉及技术面**

- 前端：投递追踪看板增加自动检测入口和状态建议审批卡
- 后端/Agent 工具：新增 `scan_inbox`/`detect_sent_mail` 工具，Webmail DOM 解析逻辑，LLM 分类提示词

---

## 3. P1 — 必须修复（严重影响体验）

### P1-1：Agent 运行中可无提示切换新对话，任务上下文丢失

| 字段 | 内容 |
|------|------|
| **Bug ID** | BUG-R3-NAV-GUARD-01 |
| **模块** | R3 — 聊天 |
| **严重度** | P1 |
| **状态** | FAIL |

**问题描述**

当 Agent 正在流式生成回复时（界面显示「停止生成」），用户点击侧栏「新对话」、历史对话、经历仓库或投递追踪，系统**没有任何阻止、确认或提示**，直接创建并切换到新的空对话。原任务在后台继续执行，但用户无法感知任务仍在运行，也没有全局入口可以返回。

**影响**

用户误以为生成被取消，可能在原任务仍在执行时发起新对话，导致任务上下文与用户认知完全脱节。

**截图证据**

![CHAT-15-nav-guard-failure.png](../evidence/screenshots/R3/CHAT-15-nav-guard-failure.png)

**复现步骤**

1. 在任意对话发送一个会持续输出的请求
2. 在回复未完成、仍显示「停止生成」时，点击侧栏「新对话」
3. 观察页面状态

**期望行为**

产品必须从以下两种方案中**二选一**并全局一致执行：

- **方案 A（阻止切换）**：生成期间禁用新建/切换入口，并提示「正在生成中，完成或停止后再切换」
- **方案 B（后台任务中心）**：允许切换，但切换前明确告知「原对话仍在生成」，同时在全局位置（如侧栏顶部或底部）显示可点击的运行中任务入口、任务完成通知和返回原对话能力

**验收条件**

1. 生成期间点击新对话、历史对话、经历仓库、投递追踪，均遵循统一的 A 或 B 策略
2. 原任务不可丢失，必须可见、可返回
3. 若采用方案 B，需有全局运行任务指示器（含完成通知）
4. 若采用方案 A，切换入口需明确标注禁用原因，生成完成后自动恢复

---

### P1-2：账户菜单缺少设置入口，无法管理档案、隐私和数据

| 字段 | 内容 |
|------|------|
| **Bug ID** | BUG-R10-SETTINGS-01 / GAP-P1-SETTINGS-01 |
| **模块** | R10 — 设置与隐私 |
| **严重度** | P1 |
| **状态** | FAIL / GAP |

**问题描述**

用户已登录状态下，左下角「账户菜单」只包含三项：**切换深色模式、切换到英文、退出登录**。没有「设置」入口，也没有任何替代页面可以让用户编辑个人档案、查看隐私政策或执行数据清除。

**截图证据**

![SET-04-settings-entry-missing.png](../evidence/screenshots/R10/SET-04-settings-entry-missing.png)

**复现步骤**

1. 登录后点击左下角账户头像/名称
2. 观察弹出的菜单项

**期望行为**

账户菜单包含「设置」入口。设置页至少分为以下区域：

- **个人档案**：可查看和编辑职业阶段、目标岗位、偏好语言等 Agent 会使用的画像信息；编辑后可保存
- **隐私与数据**：说明 LLM 会获取/发送哪些数据、数据流向；提供数据清除入口（含清除范围说明、二次确认弹窗、成功/失败反馈）
- **偏好**：主题、语言等（已有，集中即可）

**验收条件**

1. 从账户菜单在两次点击内可进入设置页
2. 个人档案可编辑并保存，关闭重开后保留
3. 隐私页可见数据流向说明
4. 数据清除有范围说明、二次确认弹窗、清除成功/失败反馈
5. 所有入口支持中文和英文

---

### P1-3：首次启动缺少隐私知情同意

| 字段 | 内容 |
|------|------|
| **Bug ID** | BUG-R10-PRIVACY-01 / GAP-P1-PRIVACY-01 |
| **模块** | R10 — 设置与隐私 / R2 — 认证 |
| **严重度** | P1 |
| **状态** | GAP |

**问题描述**

使用全新的 `user-data` 目录冷启动应用后，**直接展示登录页**，没有任何隐私协议弹窗、没有数据流向说明、没有 LLM 处理范围的告知、没有用户同意入口。这不仅是体验问题，更是**合规风险**。

**截图证据**

![R2-cold-start-login.png](../evidence/screenshots/R2/R2-cold-start-login.png)

**复现步骤**

1. 使用全新（无任何历史数据）的 `user-data` 目录启动 App
2. 观察登录页出现前的过程

**期望行为**

首次启动时，在登录页**之前**弹出隐私知情同意弹窗，内容包括：

- Coolto 会如何使用你的数据（LLM 处理范围说明）
- 数据存储位置和安全措施简述
- 用户权利（查看、导出、删除数据）
- 「同意并继续」和「查看隐私政策全文」两个按钮
- 不同意时无法进入应用

**验收条件**

1. 全新 `user-data` 启动时显示隐私弹窗，同意前不发送任何业务数据
2. 弹窗包含数据流向和 LLM 处理范围说明
3. 设置页可再次查看隐私协议和数据清除入口
4. 支持中文和英文

---

### P1-4：EmptyState 固定两张静态卡片，未按用户阶段动态变化

| 字段 | 内容 |
|------|------|
| **Bug ID** | BUG-R3-EMPTY-STATE-01 / GAP-P1-EMPTY-STATE-01 |
| **模块** | R3 — 聊天 |
| **严重度** | P1 |
| **状态** | GAP |

**问题描述**

主对话页面的空状态无论用户处于什么阶段，始终只显示两张固定建议卡：「整理我的经历」和「生成自我介绍」。当用户已经有经历、已有 JD 匹配、已有投递记录时，空状态不会根据实际资产动态调整建议内容。

**截图证据**

![CHAT-04-empty-state-static-two-cards.png](../evidence/screenshots/R3/CHAT-04-empty-state-static-two-cards.png)

**复现步骤**

1. 在有 14 条经历、已有 JD 匹配、已有投递记录的状态下进入主页
2. 在无经历的全新账户下进入主页
3. 对比两者空状态

**期望行为**

EmptyState 最少覆盖以下四个阶段，并根据真实的经历/JD/匹配/投递数量动态驱动：

| 阶段 | 用户状态 | 建议卡示例 |
|------|---------|-----------|
| 阶段 1 | 无经历 | 「添加你的第一条工作经历」「导入简历文件」 |
| 阶段 2 | 有经历，无 JD | 「粘贴目标岗位 JD」「浏览求职网站」 |
| 阶段 3 | 有 JD 匹配，无投递 | 「生成针对性简历」「开始投递这个岗位」 |
| 阶段 4 | 有投递记录 | 「查看投递进度」「准备面试问题」 |

**验收条件**

1. 空态建议卡数量 ≥ 2 且按阶段变化
2. 阶段判断由 `experience_count`、`match_report_count`、`application_count` 等真实资产驱动，非前端静态配置
3. 每张建议卡点击后发起对应的实际操作

---

### P1-5：STAR 追问器设计未落地，经历录入只是普通聊天

| 字段 | 内容 |
|------|------|
| **Bug ID** | BUG-R4-STAR-01 / GAP-P1-STAR-01 |
| **模块** | R4 — 经历银行 |
| **严重度** | P1 |
| **状态** | GAP |

**问题描述**

从经历仓库入口进入「录入经历」，实际进入的是**普通聊天界面**。产品设计方案中的 STAR 分屏（Probe Chat + Canvas/Block 分屏视图）、动态追问策略、连续无效回答底线模式、保存前真实性确认墙均未实现。用户只能在普通聊天中描述经历，缺少结构化的录入引导。

**截图证据**

![EXP-23-star-split-missing.png](../evidence/screenshots/R4/EXP-23-star-split-missing.png)

**复现步骤**

1. 进入经历仓库
2. 点击添加/录入经历
3. 观察界面布局和引导流程

**期望行为**

按照 STAR 设计方案落地以下功能：

- **分屏布局**：左侧为探针式对话（Probe Chat），右侧为结构化 Canvas/Block 视图，实时展示当前经历结构
- **动态追问**：根据用户已输入内容，智能追问 S（情境）、T（任务）、A（行动）、R（结果）各维度的缺失信息
- **底线模式**：连续 N 次无效回答（如「不知道」「忘了」）后，切换为底线模式，降低追问深度
- **真实性确认墙**：保存前展示经历要点摘要，要求用户逐项勾选确认

**验收条件**

1. 经历录入入口呈现分屏布局（对话 + 结构化视图）
2. 追问策略覆盖 STAR 四个维度，根据已有内容动态调整追问方向
3. 连续无效回答后触发底线模式
4. 保存前展示确认墙，用户逐项勾选后方可保存

---

### P1-6：L2 高频招聘网站 DOM 规则表未实现

| 字段 | 内容 |
|------|------|
| **Bug ID** | GAP-P1-BROWSER-RULES-01 |
| **模块** | R7 — 自动填表 |
| **严重度** | P1 |
| **状态** | GAP |

**问题描述**

当前自动填表系统只实现了两层策略：L1（LLM 通用语义匹配）和 L3（用户手动兜底）。作为核心的 L2 层——高频招聘网站（Boss 直聘、猎聘、拉勾、51job、智联等）的精确 DOM 映射规则表——完全缺失。这意味着在最常使用的招聘网站上，填表准确率完全依赖 LLM 的一次性语义推断，无法保证稳定性。

**复现步骤**

1. 代码审查：`src/tools/browser/` 目录中无网站特定的 DOM 规则文件
2. 实际的 L1 语义匹配在通用夹具上可以工作（已验证 PASS），但在真实招聘网站上的表现无法保证

**期望行为**

建立网站规则表系统：

- **规则表 Schema**：定义每条规则的结构（目标网站 URL pattern → 字段名 → DOM 选择器/策略）
- **首批覆盖**：至少 5 家高频网站——Boss 直聘、猎聘、拉勾、51job、智联
- **匹配引擎**：填表时优先用 L2 规则精确匹配，miss 后降级到 L1 LLM 语义匹配，再 miss 降级到 L3 手动

**验收条件**

1. `src/tools/browser/` 下存在网站规则表文件
2. 规则表 schema 可扩展，新增网站只需添加配置无需改代码
3. 填表链路遵循 L2 → L1 → L3 的降级策略
4. 首批至少覆盖 3 家网站的字段映射

---

## 4. P2 — 建议修复（可延后至下个迭代）

> P2 项不影响核心链路可用，但影响用户感知和体验完整性。

### P2-1：登录页标题未区分首次/回访用户

| 字段 | 内容 |
|------|------|
| **Bug ID** | GAP-P2-LOGIN-TITLE-01 |
| **模块** | R2 — 认证 |
| **截图** | `R2/R2-cold-start-login.png`（当前始终显示「欢迎回到 Coolto」） |

**需求**：`LoginScreen.vue` 根据是否为全新 `user-data` 判断，首次显示「欢迎使用 Coolto」+ 简短产品介绍，回访显示「欢迎回到 Coolto」。

**验收**：新 `user-data` 启动 → 标题为「欢迎使用 Coolto」；已有数据启动 → 标题为「欢迎回到 Coolto」。

---

### P2-2：浏览器缺少「分析此页面」JD 入口

| 字段 | 内容 |
|------|------|
| **Bug ID** | GAP-P2-JD-BROWSER-01 |
| **模块** | R6 — 浏览器 |
| **截图** | `R6/BRW-ANALYZE-JD-button-missing.png`（浏览器工具栏仅有地址栏和搜索框） |

**需求**：内置浏览器地址栏旁增加「分析此页面」按钮，点击后 Agent 读取当前页面 DOM，尝试提取 JD 信息并导入为岗位描述。

**验收**：在浏览器中打开包含 JD 的页面后，点击按钮 → Agent 解析 → 生成 JD 结构化预览审批卡。

---

### P2-3：简历上传后缺少即时反馈（评分、热力图、雷达图）

| 字段 | 内容 |
|------|------|
| **Bug ID** | GAP-P2-RESUME-AHA-01 |
| **模块** | R5 — JD/匹配/简历 |
| **截图** | `R5/JD-26-resume-upload-feedback-missing.png` |

**需求**：用户上传简历后展示即时反馈，包含整体评分、内容含水量热力图、技能雷达图、以及一份可分享的「平行宇宙」（风格化改写版本）。

**验收**：上传完成 → 展示评分卡（含分数、热力图、雷达图、平行宇宙入口）。

---

### P2-4：审批卡点击后无即时执行状态反馈

| 字段 | 内容 |
|------|------|
| **Bug ID** | UX-R5-ASYNC-FEEDBACK-01 |
| **模块** | R5 — JD/匹配/简历 |
| **截图** | `R5/JD-02-after-accept-async-feedback.png`（接受后的状态变化正常，但点击瞬间缺少过渡） |

**需求**：用户在审批卡（如「保存岗位描述到云端」）点击「接受并执行」后，300ms 内卡片应切换为执行中状态（如「正在保存 JD…」），成功后变为「已保存，正在匹配…」，失败时显示错误原因和重试按钮。**重复点击不产生重复写入**。

**验收**：点击后 < 300ms 进入执行态；成功/失败/网络中断分别有互斥且明确的终态；重复点击不重复写入。

---

### P2-5：浏览器打开公司网站不自动关联投递记录

| 字段 | 内容 |
|------|------|
| **Bug ID** | GAP-P2-COMPANY-LINK-01 |
| **模块** | R9 — 投递追踪 |

**需求**：用户在浏览器中打开某公司网站时，系统自动检测是否与已有投递记录的公司匹配，匹配后提示关联。

**验收**：打开已投递公司的官网 → 投递追踪出现关联提示。

---

### P2-6：面试准备 AI 模块未实现

| 字段 | 内容 |
|------|------|
| **Bug ID** | GAP-P2-INTERVIEW-AI-01 |
| **模块** | R8 — 邮件助手 |

**需求**：基于 JD 要求和用户简历，生成面试问题列表、模拟面试、答题反馈。属 PRD 中「待定」功能，需 PM 最终确认是否纳入。

---

## 5. 规格漂移 — PM 已确认

以下项目不是代码缺陷，而是 PRD 文档与代码现状不一致。PM 已于 2026-08-04 逐项确认并更新产品文档，此处仅作为开发参考。

| ID | 描述 | PM 决策 |
|----|------|---------|
| PM-01 | 偏好学习同时标「V1 未实现」和 P0 | **以代码为准**，V1 不做偏好学习 |
| PM-02 | 图片 OCR：正文说无 OCR，附录要求提取文字 | **ToB OCR 不做** |
| PM-03 | PRD 说 V1 不做云同步，代码已有完整同步队列 | **以代码为准**，云同步已实现 |
| PM-04 | PRD 标经历页/投递追踪为待实现，代码已完整 | **以代码为准**，经历页和投递追踪已实现 |
| PM-05 | 后端地址三处不一致（8000/8080/hkapi） | **以代码为准**，使用 `hkapi.coolto.com.cn` |
| PM-06 | 平台范围 PRD 写 PC/Mac，打包仅 macOS arm64 | **Mac 和 PC（Windows）**，V1 同时支持两个平台 |

---

## 6. 修复优先级汇总

| 优先级 | 数量 | 涉及模块 | 发布阻塞 |
|--------|------|---------|----------|
| **P0** | 2 | R5（简历生成）、R9（Webmail 自动检测） | ✅ 是 |
| **P1** | 6 | R3（导航保护）、R10（设置/隐私 × 2）、R3（EmptyState）、R4（STAR）、R7（网站规则表） | ✅ 是 |
| **P2** | 6 | R2/R5/R6/R8/R9 | ❌ 否 |
| **PM 确认** | 6 | 文档/规格 | ❌ 否 |

> **2026-08-08 状态更新**：P0-1 已修复（S4.5 结构性修复）；P1-1/P1-2/P1-4/P2-1/P2-4 已修复，P1-3 已实现；P0-2/P1-5/P1-6/P2-2/P2-3/P2-5/P2-6 验证为不存在（功能缺口/规格冲突，见第 8 节）。

---

## 7. 附录：截图索引

所有截图位于 `qa/evidence/screenshots/`，按测试轮次归档。

| 文件路径 | 对应问题 | 用途 |
|----------|---------|------|
| `R5/JD-14-resume-generation-tool-error.png` | **P0-1** | 简历生成工具调用失败的错误界面 |
| `R3/CHAT-15-nav-guard-failure.png` | **P1-1** | 生成期间无提示切换到新对话 |
| `R10/SET-04-settings-entry-missing.png` | **P1-2** | 账户菜单仅有主题/语言/退出 |
| `R2/R2-cold-start-login.png` | **P1-3** | 冷启动直接进登录页，无隐私弹窗 |
| `R3/CHAT-04-empty-state-static-two-cards.png` | **P1-4** | 空态仅两张静态卡片 |
| `R4/EXP-23-star-split-missing.png` | **P1-5** | STAR 分屏设计未落地，仅为普通聊天 |
| `R2/R2-form-validation-error.png` | P2（参考） | 未注册邮箱请求验证码无明确反馈 |
| `R5/JD-02-after-accept-async-feedback.png` | **P2-4** | 审批卡异步反馈（正常流程参考） |
| `R5/JD-06-match-report.png` | ✅ PASS | 匹配分析报告 80.4 分（正面证据） |
| `R5/JD-26-resume-upload-feedback-missing.png` | **P2-3** | 简历上传缺少评分反馈 |
| `R6/BRW-ANALYZE-JD-button-missing.png` | **P2-2** | 浏览器缺少「分析此页面」按钮 |
| `R7/FILL-36-write-access-approval-card.png` | ✅ PASS | 写权限审批卡（正面证据） |
| `R9/TRK-19-auto-mail-detection-not-present.png` | **P0-2** | 投递追踪无自动邮件检测 |
| `R2/R2-wrong-password-error.png` | ✅ PASS | 错误密码提示（正面证据） |
| `R2/R2-session-recovery.png` | ✅ PASS | 会话恢复成功（正面证据） |
| `R2/R2-session-recovery-real.png` | ✅ PASS | 会话恢复真实场景（正面证据） |
| `R2/R2-session-recovery-FAIL.png` | ⚠️ 旧版 FAIL | 旧版会话恢复失败（本轮已修复，不再复现） |

---

## 8. 验证与修复记录（2026-08-08，feat/resume_optimization @ 85cf157+）

> 本节对全部 P0/P1/P2 项在当前分支逐一验证（QA 基线 `app` 分支 `b8b1457` 与当前分支之间有大量 S4.5 改动），并完成用户确认的修复。验证方式为代码审查 + `npm run check` 门禁。

| ID | 验证结论 | 处置 |
|----|---------|------|
| **P0-1** | ✅ **已修复**（当前分支已不存在）：offset 不再由 Agent 计算/提交，改为 `evidenceId`（`experienceId:start:end`）编码 + 宿主解析（`src/resume/workspace/evidence-binding-resolver.ts`）；自动修复（`evidence-auto-repair.ts`）、有界重试（`MAX_REPAIR_ROUNDS=3`、续跑预算 230s/30 次调用）、`ready_for_approval` 可达（`quality-state.ts:9`）。残留 2 处过时「UTF-16 offset」提示词已清理（`get-resume-source-snapshot.ts:27`、`resume-performance-session.ts:244`） | 标注已修复 + 文案清理 |
| **P0-2** | ❌ **不存在**（从未实现，属新功能）：全仓库无 `scan_inbox`/`detect_sent_mail` 工具（`src/tools/registry.ts` 全量清单）、Tracker 无邮件通道、看板无自动检测入口；仅残留 `source:"email"`/`webmail_compose` 死枚举与 B5「撰写」侧能力（方向相反） | 标注 GAP，新功能另行排期 |
| **P1-1** | ⚠️ **存在**（会话层静默拦截，无任何提示/禁用，主视图切换无防护）→ **已修复（方案 A）**：`Sidebar`/`SidebarPrimaryNavigation` 接收 `generating`，生成中禁用新对话/经历仓库/求职仓库/投递追踪/对话历史/本地草稿并提示「正在生成中，完成或停止后再切换」；`App.vue` guard 兜底检查 `running` | 已修复 |
| **P1-2** | ⚠️ **部分存在**（个人档案对话框已有，无设置入口/隐私说明/数据清除）→ **已补齐**：账户菜单新增「设置」；`SettingsDialog` 分个人档案（复用 ProfileDialog）/隐私与数据（数据流向说明 + 清除本地数据二次确认）/偏好；main 新增 `data:clear-local` IPC（`clear-local-data.ts`：清对话历史、简历草稿、选中文件、同步库 `purgeLocal`，云端保留后重新 Bootstrap） | 已修复 |
| **P1-3** | ❌ **不存在**（冷启动直达登录页）→ **本次实现**：`PrivacyConsentDialog` 登录页之前弹出（数据使用/存储位置/用户权利 + 隐私政策全文展开 + 同意并继续），同意状态存 `localStorage("coolto-privacy-consent")`，不同意无法进入应用，双语 | 已实现 |
| **P1-4** | ⚠️ **存在**（`EmptyState.vue` 硬编码 2 张卡）→ **已修复**：新增 `use-empty-state-stages.ts` 按真实资产计数（`experiences.search`/`applications.references`/`applications.list`）分四阶段，每阶段 2 张阶段卡 + 2 张通用卡，点击执行真实动作（切经历仓库/浏览器/求职仓库/投递追踪/发 prompt）。注：全局 match 报告数不可持久化获取，以 JD 数（references.jds）作为「有 JD 匹配」代理 | 已修复 |
| **P1-5** | ❌ **不存在**（经历录入为普通表单/聊天，无 STAR 分屏、追问、底线模式、确认墙） | 标注 GAP，新功能另行排期 |
| **P1-6** | ❌ **不存在 + 规格冲突**：`src/tools/browser/` 与 `src/desktop/main/browser/` 全部为通用打标原语，无站点规则表、无 L2→L1→L3 降级；且 `local-docs/browser-autofill-roadmap`（README:70、03-form-recognition:32）明确选择「不维护字段映射规则表」架构，与 QA 验收标准冲突 | 标注规格冲突，待 PM 决策是否推翻现有架构 |
| **P2-1** | ⚠️ **存在**（`LoginScreen.vue:69` 恒显「欢迎回到 Coolto」）→ **已修复**：`localStorage("coolto-visited")` 首访判定，首访显示「欢迎使用 Coolto」+ 简介，首次登录成功写入，退出登录后回访标题正确 | 已修复 |
| **P2-2** | ❌ **不存在**（浏览器工具栏无「分析此页面」按钮与 API 通道） | 标注 GAP |
| **P2-3** | ❌ **不存在**（上传走附件解析导入，无评分/热力图/雷达图/平行宇宙） | 标注 GAP |
| **P2-4** | ⚠️ **部分存在**（防重复写入已完备：`ApprovalStore.take()` 等；缺执行中/终态 UI，`approval.executing` 渲染端未处理）→ **已修复**：`ApprovalCard` busy 时按钮变「正在执行…」+ spinner、卡片提示「正在执行，请稍候…」；`agent-event-handler` 处理 `approval.executing/completed/failed` 维护 busy 状态；成功=卡片消失，失败=错误行 + 可重试 | 已修复 |
| **P2-5** | ❌ **不存在**（无公司域名匹配/关联逻辑） | 标注 GAP |
| **P2-6** | ❌ **不存在**（仅投递追踪 InterviewRound 子实体，无 AI 面试准备模块；产品侧 TBD 待 PM 确认） | 标注 GAP / TBD |

### 8.1 本次修复文件清单

- **P1-1**：`App.vue`、`components/Sidebar.vue`、`components/SidebarPrimaryNavigation.vue`、`styles/base-sidebar-conversations.css`、`styles/base-artifact-resume.css`
- **P1-2**：`components/UserAccountMenu.vue`、`components/SettingsDialog.vue`（新）、`styles/base-settings-dialog.css`（新）、`styles/base.css`、`main/clear-local-data.ts`（新）、`main/ipc.ts`、`main/sync/local-sync-store.ts`（`purgeLocal`）、`main/conversation-store.ts`（`clearAll`）、`main/resume-drafts/draft-file-repository.ts` + `resume-draft-service.ts`（`clearAll`）、`preload/index.ts`、`shared/types/desktop-api.ts`、`lib/demo/browser-demo-api.ts`、`lib/unavailable-desktop-api.ts`
- **P1-3**：`components/PrivacyConsentDialog.vue`（新）、`styles/base-privacy-dialog.css`（新）、`styles/base.css`、`App.vue`
- **P1-4**：`app/use-empty-state-stages.ts`（新）、`components/EmptyState.vue`、`app/AppChatWorkspace.vue`
- **P2-1**：`components/LoginScreen.vue`、`chat/use-chat-auth.ts`、`App.vue`
- **P2-4**：`components/ApprovalCard.vue`、`chat/agent-event-handler.ts`
- **P0-1 残留**：`tools/get-resume-source-snapshot.ts`、`desktop/main/resume-performance-session.ts`
- **i18n**：`renderer/src/i18n/catalog-common.ts`

### 8.2 验证门禁

- `npm run check`：模板快照 ✅（见下）、587 个源文件 250 行门禁 ✅、Node typecheck ✅、preload+renderer typecheck ✅、单测 411/415（4 个失败为 Windows 环境既有问题，见下）、Node build ✅、Electron build ✅。
- 4 个既有失败（`git stash` 后复现，与本次改动无关）：`test/atomic-pdf-writer.test.ts` 2 项（断言 unix `/tmp/` 路径，Windows 分隔符差异）、`test/update-installer.test.ts` 2 项（`spawn /bin/bash`，Windows 无 bash）。
- 既有仓库问题顺带修复：`check:resume-template` 在 Windows `core.autocrlf=true` 检出下因 CRLF 导致 lock 哈希漂移，已将 lock 所列文本文件规范化为 LF（与 lock 哈希一致，`git diff` 为空，仅警告）；lock 内容本身未改动。
- 本次未 commit / push（AGENTS.md 约束，等待用户指示）。

> **文档维护**：P0-1/P1-1/P1-2/P1-3/P1-4/P2-1/P2-4 已完成修复并可通过门禁；P0-2/P1-5/P1-6/P2-2/P2-3/P2-5/P2-6 验证为不存在（功能缺口），其中 P1-6 与浏览器架构文档冲突、P2-6 为 PM TBD，均待产品决策后另行排期。

### 8.3 新功能缺口排期清单（按实现难度从低到高）

> 以下 7 项均为验证为"不存在"的功能缺口（非回归 bug）。排序依据：实现工作量、依赖面、LLM/交互复杂度；标注 ⚠️ 的项有产品/PM 前置决策，排期前需先确认。

| 序 | ID | 功能 | 预估工作量 | 主要工作 | 前置条件 |
|----|----|------|-----------|---------|---------|
| 1 | P2-2 | 浏览器「分析此页面」JD 入口 | **低（约 0.5–1 天）** | 浏览器工具栏新增按钮 + browser IPC 通道 + 复用现有 `prepare_jd_import` Agent 工具触发页面 DOM 提取与 JD 审批卡 | 无 |
| 2 | P2-5 | 公司网站自动关联投递记录 | **低–中（约 1–2 天）** | 域名归一化匹配（www./大小写/协议）、浏览器导航完成后触发匹配、投递记录存在公司信息时的关联提示 UI；无 LLM 依赖 | 无 |
| 3 | P1-6 | L2 高频招聘网站 DOM 规则表 | **中（约 2–3 天）** | 规则表 Schema + JSON 配置、L2→L1→L3 降级匹配引擎、首批 3–5 家站点字段映射（需真实站点 DOM 调研） | ⚠️ 与 browser-autofill-roadmap 架构决策冲突，待 PM 决策 |
| 4 | P2-3 | 简历上传即时反馈（评分/热力图/雷达图/平行宇宙） | **中–高（约 3–5 天）** | 上传后触发评分链路、评分卡 + 含水量热力图 + 技能雷达图三个新可视化组件、平行宇宙（LLM 风格化改写稿生成与草稿落库） | 无 |
| 5 | P2-6 | 面试准备 AI 模块 | **高（约 4–6 天）** | 基于 JD+简历生成面试问题、模拟面试对话流、答题反馈；需新 Agent 工具 + 对话交互 UI | ⚠️ 产品侧 TBD，待 PM 确认是否纳入 |
| 6 | P1-5 | STAR 追问器（经历录入分屏） | **高（约 5–8 天）** | Probe Chat + Canvas 分屏布局、STAR 四维动态追问策略、无效回答底线模式、保存前真实性确认墙；涉及经历录入交互体系重构与写入闭环改造 | 无 |
| 7 | P0-2 | Webmail 自动检测引擎 | **最高（约 1–2 周）** | Gmail/QQ/163 三家的已发送/收件箱 DOM 解析、LLM 邮件分类、看板状态建议审批卡、投递记录创建/更新链路、安全约束（永不自动发送/提交）；需真实邮箱账号端到端验收 | 无（建议与浏览器路线合并排期） |
