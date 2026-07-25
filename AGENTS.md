# AGENTS.md

本文件是本仓库的 Agent 协作约定。开始任何工作前先读一遍。

## 工作原则

1. **不确定必追问**：任何不确定的点、任何值得讨论的设计/取舍，都必须先向用户确认，得到答复后再动手。不要擅自替用户做假设。
2. **每阶段完成写回 roadmap**：无论做了什么，每完成一个阶段（或阶段内的一个 section），都要把完成情况写回 `local-docs/` 下对应 roadmap 文件夹里的文档。
   - 做的是哪个 section，就写在那个 section 对应文件夹的 README 里。
   - **不要新建 section**：只在已有 section 对应的文档里追加/更新完成记录，保持 roadmap 结构不变。
3. **文件行数**：新业务文件目标 220 行，硬上限 250 行；禁止上帝类。
4. **提交约束**：除非用户明确要求，否则不 commit / push。

## 项目命令

- 全量校验（提交前必跑）：`npm run check`
  - 依次执行：`check:resume-template` → `typecheck`（Node）→ `desktop:typecheck`（Vue/vue-tsc）→ `test` → `build` → `desktop:build`
- 仅类型检查：`npm run typecheck`（Node 主进程）、`npm run desktop:typecheck`（渲染进程 Vue）
- 单测：`npm run test`（`node --test`，测试不依赖 electron 运行时）
- 桌面开发：`npm run desktop:dev`

## 代码约定

- 主进程/共享代码用 ESM，import 路径带 `.js` 扩展名（与现有代码一致）。
- 渲染进程用 Vue 3 `<script setup lang="ts">`；共享类型从 `@desktop/types`（`src/desktop/shared/types.ts`）引入。
- 主进程 Electron 相关模块无法在 `node --test` 下运行，靠 `npm run check` 的类型检查 + 真实 Electron 手动验收覆盖（与现有 main 模块一致）。
