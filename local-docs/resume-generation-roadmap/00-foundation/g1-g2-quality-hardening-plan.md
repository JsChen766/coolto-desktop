# G1/G2 质量加固计划

> 状态：已完成  
> 日期：2026-07-23  
> 目的：关闭 G3 前置质检发现，未通过本计划门禁前不开始 G3

## 1. 冻结的验收口径

- 页面占用率以模板扣除固定页边距后的 `content box` 可用高度为分母；85% 是该区域的
  全局硬下限，不以整张 297mm 物理页面为分母。
- App 与 Web 对同一份 `ResumeStructure` 必须使用相同模板、字体、section 顺序、字段解释
  和安全 Markdown 规则；同一文本必须产生相同可见内容。
- `ResumeSourceSnapshot` 和 EvidenceLedger 是当前运行任务的瞬态状态。完整 snapshot 工具结果
  不得进入持久化对话文件；任务恢复时必须重新读取普通业务 API 并重建快照。
- G1/G2 不改变共享数据库中的 `ResumeVariant.structured` 契约。

## 2. G1 加固切片

### H1.1 外部契约

- 为经历列表、详情和 revision 增加运行时 normalization；
- 所有缺失必需字段、非法 category/status 和结构错误失败关闭；
- profile、JD、经历使用同一套 `ApiContractError` 语义。

### H1.2 Snapshot 确定性

- 将来源范围按稳定 experience ID 规范排序；
- 明确选择顺序不代表最终简历展示顺序；
- 相同用户、JD、经历集合、revision 和模板必须产生相同 fingerprint；
- 增加顺序置换、深冻结和 malformed response 回归。

### H1.3 EvidenceLedger 稳定 ID

- 所有 bullet ID 先 trim、再校验非空、再去重和存储；
- release/replace/validateCandidate 使用相同 canonical ID；
- requirement ID 和证据引用 ID 执行一致的边界校验；
- 增加空 ID、空格别名、替换回滚和候选重复 ID 回归。

### H1.4 瞬态持久化策略

- 新建单一职责的 Agent transcript persistence policy；
- 保存本地对话前，将 `get_resume_source_snapshot` 的完整 content/details 替换为可重建标记；
- Agent 当前内存中的消息不被修改，保证当前 turn 和后续同一运行会话仍能使用完整上下文；
- App 重启恢复后，模型必须重新调用 snapshot 工具；
- 增加“不落完整正文、原消息不变”的测试。

## 3. G2 加固切片

### H2.1 拆分 renderer

将现有超长 `compile.ts` 拆为：

```text
resume-renderer/
├── compile.ts            # 仅负责编译编排和最终 gate
├── render-dom.ts         # ResumeStructure → canonical DOM
├── safe-markdown.ts      # 与 Web 一致的安全 Markdown
├── font-readiness.ts     # 字体等待和 family 检查
└── dom-measurement.ts    # 页面与 bullet 真实 DOM 测量
```

每个模块保持单一职责；原则上新文件控制在约 250 行以内，确有必要时按领域继续拆分。

### H2.2 Web/App 同构

- App 对 `raw_text` 和 bullet text 使用与 Web 相同的 inline Markdown 白名单和属性剥离；
- LinkedIn 等 header 字段使用相同 DOM 语义；
- 保持 canonical class、data attributes、CSS variables 和 section fallback 一致；
- 增加 Markdown、纯文本和混排回归，防止字符与换行测量漂移。

### H2.3 编译隔离和候选绑定

- 主进程对共享隐藏 BrowserWindow 的操作强制串行；
- 编译与 PDF 输出作为同一个原子操作绑定到同一结构化候选；
- 未通过 `qualified` 的候选不能进入 PDF 输出；
- 超时、dispose 和失败后队列仍可继续工作。

### H2.4 PDF postflight

- 中文字符继续要求 SimSun；
- 英文字母和数字都要求 Times New Roman；
- 检查实际字体资源缺失/未嵌入状态；
- 保留单页、A4 portrait 和文本层门禁。

## 4. 测试与门禁

必须同时通过：

1. G1 新增的顺序置换、空/别名 ID、经历 malformed contract、transcript redaction 测试；
2. G2 Markdown 同构、并发编译串行、候选绑定和数字字体分类测试；
3. `npm run check`；
4. `npm run qa:resume-renderer` 的中文、英文、混排、欠填、溢出、尾行和 PDF 回归；
5. 人工查看 QA PNG，不得出现 Markdown 标记泄漏、截断、重叠或额外页面；
6. 文档链接、代码格式和 `git diff --check` 通过。

全部满足后，将本文件状态改为“已完成”，更新 G1/G2 README，再单独制定 G3 计划。

## 6. 实施结果

完成日期：2026-07-23。

- G1：经历响应已增加运行时契约解析；snapshot 对经历选择顺序确定；EvidenceLedger 使用
  canonical bullet ID；完整 snapshot 工具结果在对话持久化前替换为可重建标记；
- G2：原 555 行 renderer 已拆为 DOM、Markdown、字体、bullet 测量、页面测量和编译编排
  模块；App 使用与 Web 相同版本的 `marked` 和相同 inline 白名单；
- 隐藏 Chromium 操作已串行化，PDF 编译与候选成为原子操作，未通过候选拒绝打印；
- PDF postflight 已覆盖英文字母和数字的 Times New Roman，并检查缺失字体资源；
- API client 已拆为 transport、profile/JD、experience 资源模块和薄 facade；
- `npm run check` 通过，共 55 项测试；
- 真实 Chromium QA 通过，页面占用率 87.29%，最低尾行比例 67.65%，Markdown 标记未泄漏，
  并发请求未串结果，A4 PDF 与 SimSun/Times New Roman postflight 通过；
- 真实账号只读 smoke test 再次成功锁定 21 条 JD requirements 和 7 条 current revisions；
- 凭据、session、完整 snapshot 和业务写入均未持久化。

## 5. 明确不做

- 本轮不生成简历正文；
- 不新增保存 Resume/ResumeVariant 的接口；
- 不修改共享数据库 schema；
- 不把 G3 Workspace、写作工具或局部修复逻辑混入 G1/G2 模块；
- 不为了减少文件数量建立集中承载 API、证据、渲染和持久化职责的上帝类。
