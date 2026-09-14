# Coolto PRD serial closure (Cursor PM)

Updated: 2026-09-13 Asia/Hong_Kong  
Status: **ACTIVE — complete remaining full PRD; App first, Backend supporting, Admin/Web last**  
Operating model: `.cursor-pm/OPERATING-MODEL.md`

## Phases

| Phase | Goal | Status |
| --- | --- | --- |
| **0** | Worktree cleanup | **DONE** |
| **1** | MAT → trunk | **DONE** — `evidence/phase-1-close-2026-09-11.md` |
| **2** | PRO/PREF from trunk+MAT | **DONE** — `evidence/phase-2-close-2026-09-12.md` (467 paths → trunk) |
| **3** | Backend Admin handback (D₁) | **DEV DONE (branch)** — uncommitted overlay leftover; merge `main` when approved; `phase-3-gates-2026-09-12.md` |
| **4** | App closure (C) | **COMMITTED (local)** — `837fbad` on `codex/prd-privacy`; no push; **manual U remains** — `phase-4-post-merge-gates-2026-09-12.md` |
| **5** | Admin UI + roadmap | **PAUSED** — Usage BFF + live snapshot + Pipeline D₁ health done; Home/Growth D₁ not started |

## Trunk authority

`E:/vsProjects/coolto/.codex-worktrees/prd-privacy` — integration trunk (Phase 4 closure bytes; **480** paths committed at `837fbad`; gate authority).

Manifest: `.cursor-pm/evidence/phase-4-trunk-post-merge-manifest.json` (SHA-256 per path).

## Active App writer

**`prd-privacy`** — `E:/vsProjects/coolto/.codex-worktrees/prd-privacy`. User checkout `cv-agent-app` stays sandbox. No parallel App writers.

## Active Admin writer

**`prd-admin-analytics-d2`** — `E:/vsProjects/coolto/.codex-worktrees/prd-admin-analytics-d2`, branch `codex/prd-admin-analytics-d2`. Merge via PR → `admin` (not App path-copy).

## Phase 2 exit criteria (reminder)

Gates → manifest snapshot → user checkpoint → merge into `prd-privacy`.

## Next action

**App PRD 验收（2026-09-13）**：脏树 check/c2/c3 PASS；Electron leftover 大部分 PASS；**G Agent 全链 PASS**（`cv-agent-app/.env` + driver dotenv）；**H CTA** 需非空经历库才出侧栏 artifact。表：`evidence/prd-app-acceptance-2026-09-13.md`。

**App leftover slice（2026-09-13）：**
- Composer + Privacy: LLM upload-scope disclosure before model calls
- Close-to-tray: X hides; tray 退出 / Cmd+Q still quits; dirty resume still prompts
- Browser toolbar: 分析当前 JD (auto-sends chat; `extract_page` + `fetch_public_https_text`)
- Paste public HTTPS JD URL without opening the built-in browser (`fetch_public_https_text` → `prepare_jd_import` imported)
- Tracker + empty state: 准备面试问题 (chat instruction, not a second Agent loop); scheduled briefing stays 准备面试简报
- Cross-site ATS matrix left as BE8 coverage, not an App module

Then: BE7 实测 → BSF5/BE6 → BE8 → S4.5 H → S5 → R1. Backend/Admin/Web stay supporting/paused.
