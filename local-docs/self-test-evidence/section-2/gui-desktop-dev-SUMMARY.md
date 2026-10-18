# GUI: desktop:dev:cdp + smoke:desktop-chat

- Date: 2026-10-18 21:36 CST (Asia/Shanghai)
- Started: `npm run desktop:dev:cdp` (background; DISPLAY=:4)
- CDP: DevTools listening on `ws://127.0.0.1:9222/...` — **yes**
- Renderer vite: `http://localhost:5173/` HTTP 200

## smoke:desktop-chat

- Command: `npm run smoke:desktop-chat -- --new-chat --message "回复 OK"`
- Exit: **0**
- Result: `success: true`, finalResponse `OK` (~2.1s)
- Evidence: `../gui-smoke/`

## Verdict

**PASS** (see `local-docs/self-test-evidence/gui-smoke/SUMMARY.md` for bootstrap fixes on this VM).
