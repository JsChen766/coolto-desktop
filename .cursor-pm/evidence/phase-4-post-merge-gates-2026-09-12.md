# Phase 4 post-merge gates — trunk lock-in

Date: 2026-09-12  
Trunk: `E:\vsProjects\coolto\.codex-worktrees\prd-privacy` (`codex/prd-privacy`, committed `837fbad752d9e6a5e9e4385ff4e4e5677bb40590`, parent `e2663e1`; no push)  
Closure reference: `prd-app-closure` (480 paths)

## Pre-gate verification

| Check | Result |
| --- | --- |
| SHA-256 all paths in `phase-4-merge-to-trunk-manifest.json` (closure vs trunk) | **PASS** — 480/480 match, 0 missing |
| `prd-worktree-manifest.mjs` → `phase-4-trunk-post-merge-manifest.json` | **PASS** — 480 paths, `statusPorcelainSha256=124a92d2aec26b955c8c388fd4c28e07da407e8c053e8aaf747029624e041db2` |

## Automated gates (trunk worktree)

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run qa:phase-4-c3` | **PASS** | 196 Node tests |
| `node scripts/run-material-product-acceptance.mjs` | **PASS** | MAT_PRODUCT_ELECTRON_ACCEPT marker |
| `npm run qa:phase-4-c2` | **PASS** | C2 Node 46 + harness 16 + agent-tasks-ui + browser-agent 25 + UI QA 13 |

## PM / scripts (cv-agent-app sandbox)

| Item | Result |
| --- | --- |
| `prd-copy-worktree-paths.mjs` `--inventory-only` / `--write-manifest` | **PASS** (smoke) |
| `WORKTREES.md`, `PROGRAM.md`, inventory ROLE | **updated** |

## Blockers

None for automated post-merge lock-in. Manual U items remain in `phase-4-manual-test-checklist.md` (OAuth, PLAT 200%, real model RES).
