# Phase 4 entry — App closure (C)

Date: 2026-09-12  
Slice: **MAIL-INTERVIEW-SITE-CTX + shared-host integration** (Tier1 **C** + Tier2 gates).

## Authority

| Role | Path |
| --- | --- |
| Integration trunk (read-only) | `E:\vsProjects\coolto\.codex-worktrees\prd-privacy` |
| **Active App writer** | `E:\vsProjects\coolto\.codex-worktrees\prd-app-closure` |
| Branch | `codex/prd-app-closure` |
| Baseline manifest | `phase-4-trunk-snapshot-manifest.json` (**467** paths, same digest as Phase 2 close) |

`prd-profile-pref-app-takeover` is **retired as writer**; bytes live on trunk + closure worktree.

## Inherited U (from Phase 1/2 — not blockers for starting C)

- Material library in main shell without `MaterialHostPort` wiring (`create-user-services` / root IPC).
- Phase 2 deferred manual batch (chat approval, cold start, OCR import, C4 filters) → Phase 4 matrix.
- Real recruiting login sites, production accounts, macOS release ops.

## Work packages (serial inside C)

### C0 — Baseline gate

- `npm run check` on `prd-app-closure` after bootstrap — **PASS** 2026-09-12 (`node_modules` junction → `prd-profile-pref-app-takeover`).
- Re-run `npm run qa:phase-2` + `run-material-product-acceptance.mjs` when host wiring lands.

### C1 — Shared host / MaterialHostPort (largest)

- **Code complete** 2026-09-12 — see `phase-4-c1-host-wiring-2026-09-12.md`.
- `npm run check` **PASS** on `prd-app-closure`.
- Pending: `run-material-product-acceptance.mjs` (tesseract worker path in worktree `node_modules`); main-shell manual 材料库 smoke.

### C2 — MAIL / INTERVIEW / SITE / CTX loops

- **Gates + contracts** 2026-09-12 — `npm run qa:phase-4-c2`, mail loop 校验抽取, inbox 审批 UI QA；见 `phase-4-c2-gates-2026-09-12.md`.
- Runtime 已在宿主线接通；剩余：OAuth 真连、`qa:phase-4-c2` 全量 Electron 跑分、真站 U。

### C3 — Tier2 longitudinal gates (incremental)

- **Node gate** 2026-09-12 — `npm run qa:phase-4-c3`（196 tests PASS）；见 `phase-4-c3-gates-2026-09-12.md`。
- Optional: `COOLTO_C3_ANA_BACKEND=1`（D₁ DB）、`COOLTO_C3_RES_RUNTIME=1`（合成 RES acceptance）。
- 七项映射仍按下列主题；未自动化部分标 U / 手测：

1. ANA lifecycle → transport → backend replay (when D₁ on branch available locally).
2. RES real-model ≤600s + same-revision export.
3. DEL form simulations (fixture-level; real sites U).
4. PRI asset inventory / deletion interruption / consent upgrade paths.
5. SCORE calibration set (if in scope for this repo).
6. PLAT Windows matrix (IME, 200%, AX, browser recovery).
7. Final sign-off: no Outbox bypass, cross-account isolation.

## Exit (Phase 4 close)

Pre-merge checkpoint: `phase-4-close-2026-09-12.md`（`check` + `qa:phase-4-c2` + `qa:phase-4-c3` PASS；MAT acceptance / 部分手测仍 open）。

Per `OPERATING-MODEL.md`: gates → scope honesty → manifest → **user checkpoint** → merge into `prd-privacy`.

## First implementation target

**C1** — `MaterialHostPort` consumed from `create-user-services` (confirmed gap: no `material` symbol in that file today).
