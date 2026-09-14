# Phase 4 close — merge checkpoint

Date: 2026-09-12  
Writer: `E:\vsProjects\coolto\.codex-worktrees\prd-app-closure` (`codex/prd-app-closure`)  
Integration trunk: `E:\vsProjects\coolto\.codex-worktrees\prd-privacy`

## Automated gates (this session)

| Gate | Result |
| --- | --- |
| `npm run check` | **PASS** |
| `npm run qa:phase-4-c2` | **PASS** — Node 46 + harness 16 + agent-tasks-ui + browser-agent 25 + UI QA 13 |
| `npm run qa:phase-4-c3` | **PASS** — 196 Node (earlier same day) |

Supplemental (option **2**, same day):

| Item | Result |
| --- | --- |
| `node scripts/run-material-product-acceptance.mjs` | **PASS** — after `npm install` in closure (replaced junction `node_modules`; tesseract 7 worker path present) |
| `node scripts/run-resume-runtime-acceptance.mjs` | **PASS** — `sameRevision: true`, `realModel600sSameRevisionCloud: "U"` |

Still optional / U:

| Item | Status |
| --- | --- |
| `COOLTO_C3_ANA_BACKEND=1` | D₁ isolated Docker DB script |
| Real model RES ≤600s + cloud | **U** |
| `npm run qa:phase-2` (full) | Subset covered by C2/C3 gates |

## Scope delivered (C1–C3)

- **C1** MaterialHostPort in `create-user-services`, IPC, preload, agent material tools (`phase-4-c1-host-wiring-2026-09-12.md`).
- **C2** MAIL/INTERVIEW/SITE/CTX gates + inbox approval UI QA (`phase-4-c2-gates-2026-09-12.md`).
- **C3** Tier2 mapping script `qa:phase-4-c3` (`phase-4-c3-gates-2026-09-12.md`).

## U / manual before calling Phase 4 “done”

- 主窗口登录后 **材料库** smoke（导入/OCR 若需 worker 环境）
- Mail OAuth 真连、`mail_app_schedule` 启动
- A4 冷启动、B2–B3 材料 OCR、C4 筛选、PLAT 200%/崩溃恢复（`phase-4-manual-test-checklist.md`）
- 真站招聘、真实模型 RES ≤600s

## Merge to trunk (2026-09-12, user approved)

Inventory: closure `git status --porcelain -uall` → **480** paths (bootstrap manifest was **467**; +13 net new/untracked since snapshot).

Manifest: `.cursor-pm/evidence/phase-4-merge-to-trunk-manifest.json` (generated from closure status; not committed to repo).

Copy (file copy only, no git):

```bash
node scripts/prd-copy-worktree-paths.mjs \
  --from E:\vsProjects\coolto\.codex-worktrees\prd-app-closure \
  --to E:\vsProjects\coolto\.codex-worktrees\prd-privacy \
  --manifest .cursor-pm/evidence/phase-4-merge-to-trunk-manifest.json
```

| Step | Result |
| --- | --- |
| Copy closure → `prd-privacy` | **480** paths, **0** skipped |
| `npm install` on trunk | Replaced junction `node_modules` (tesseract / material deps) |
| `npm run check` on `prd-privacy` | **PASS** (~112s) |

**Commit (2026-09-12, user asked, no push):** `prd-privacy` worktree — `837fbad` (parent `e2663e1`). **Closure hygiene (plan B):** `prd-app-closure` `git reset --hard 837fbad` — clean, same HEAD as trunk.

## Post-merge trunk lock-in (2026-09-12)

| Check | Result |
| --- | --- |
| Closure vs trunk SHA (480 paths, merge manifest) | **PASS** |
| Trunk post-merge manifest | `.cursor-pm/evidence/phase-4-trunk-post-merge-manifest.json` |
| Trunk gates | `evidence/phase-4-post-merge-gates-2026-09-12.md` |
| `prd-app-closure` | Read-only reference (bytes match trunk) |

## Next options

- **Commit trunk** — stage `prd-privacy` worktree, message for Phase 4 closure slice.
- **手测** — `phase-4-manual-test-checklist.md` (材料库、Mail OAuth、PLAT).
- **Env gates** — `COOLTO_C3_ANA_BACKEND=1`, real-model RES on trunk copy.
