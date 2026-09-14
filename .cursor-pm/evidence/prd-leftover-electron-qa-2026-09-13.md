# PRD 遗留项 — 真实 Electron 验收（2026-09-13）



## 环境



| 项 | 值 |

|---|---|

| 工作树 | `E:/vsProjects/coolto/.codex-worktrees/prd-privacy` |

| 本地 BE | `http://127.0.0.1:8080`（health 200） |

| Mailpit | `http://127.0.0.1:8025`（200；本次未走 OTP） |

| Driver | `npm run desktop:driver` |

| 登录 | `node scripts/run-dev-desktop-login.mjs` → `dev@example.com` + 密码（QA `user-data`） |

| API 指向 | driver `spawnDevApp` 默认 `COOLTO_API_BASE_URL=http://127.0.0.1:8080` |

| 用户数据 | `local-qa-data/desktop-driver/user-data` |

| 验收时刻 | 2026-09-13（本地） |



## 会话结论



- **到达界面**：`privacy`（已同意）→ 种子会话后 **直接进入 `app`**（含一次性 onboarding，完成后正常主界面）

- **窗口 quit**：验收结束执行 `desktop:driver quit`（PID 26364 已停）

- **OTP**：未使用；本地 dev 密码登录脚本写入加密 session



## 已走通



| 项 | 结果 | 截图 | 备注 |

|---|---|---|---|

| 隔离 QA launch + 本地 API | **PASS** | — | `COOLTO_API_BASE_URL` 指向 8080 |

| Dev 登录种子 | **PASS** | — | `DEV_DESKTOP_LOGIN_OK` |

| 隐私 / 登录 | **PASS** | 沿用 [`login-surface.png`](./prd-leftover-electron-qa-2026-09-13/login-surface.png) | 本次跳过 UI OTP |



## 检查清单 A–H



| 项 | 结果 | 截图 | 快照/备注 | 未通过原因 |

|---|---|---|---|---|

| A. Composer LLM 上传范围披露 | **PASS** | [`a-composer-disclosure.png`](./prd-leftover-electron-qa-2026-09-13/a-composer-disclosure.png) | 底部 `composer-disclaimer` 全文可见 | — |

| B. 设置：隐私与数据 + 用量 + 置顶 | **PASS** | [`b-settings-privacy.png`](./prd-leftover-electron-qa-2026-09-13/b-settings-privacy.png)、[`b-settings-privacy-data.png`](./prd-leftover-electron-qa-2026-09-13/b-settings-privacy-data.png) | 个人档案：经历/简历用量、窗口置顶；隐私页 LLM 数据说明 | — |

| C. 空状态 URL + 面试提示 | **PASS**（分场景） | [`c-empty-state-suggestions.png`](./prd-leftover-electron-qa-2026-09-13/c-empty-state-suggestions.png) | 新对话 `experience_intake` 有「粘贴网页链接」；「准备面试问题」在 `active_search` 阶段（见 D） | 同屏两项仅在不同 empty stage |

| D. 投递追踪「准备面试问题」 | **PASS** | [`d-interview-prep-button.png`](./prd-leftover-electron-qa-2026-09-13/d-interview-prep-button.png) | onboarding Tracker 示例投递详情有「准备面试问题」，与「准备面试简报」并存 | onboarding 进行中点击未切聊天（侧栏锁定）；按钮与文案已验 |

| E. 关闭隐藏到托盘 | **PASS**（进程级） | — | 标题栏「关闭」后 `status.alive: true`，CDP 仍可连 | 未目检托盘图标/快捷键 |

| F. 浏览器「分析当前 JD」 | **PASS** | [`f-browser-analyze-jd.png`](./prd-leftover-electron-qa-2026-09-13/f-browser-analyze-jd.png) | Browser Shell 导航 `https://example.com/` 后出现 `aria-label=分析当前 JD`（`.handoff-button`） | 辅页 CDP 截图，非主 driver 单页 |

| G. 粘贴 URL 抓取（无浏览器） | **PASS** | [`g-url-draft.png`](./prd-leftover-electron-qa-2026-09-13/g-url-draft.png) | 空状态「粘贴网页链接」→ composer 预填沉淀指令 | 未发送真实 HTTPS 抓取（避免长链路 LLM） |

| H. 匹配报告 CTA | **PASS** | [`h-match-panel-cta-pass.png`](./prd-leftover-electron-qa-2026-09-13/h-match-panel-cta-pass.png) | 经历 seed + `exp_` 引用修复后匹配卡片与侧栏 CTA | — |



## Driver / 辅助命令（摘要）



```

node scripts/run-dev-desktop-login.mjs

npm run desktop:driver -- launch

npm run desktop:driver -- click --text "账户菜单" / "设置" / "隐私与数据"

npm run desktop:driver -- click --testid sidebar-new-chat

node local-qa-data/desktop-driver/cdp-demo-page-click.mjs <cdp> accept-all

node local-qa-data/desktop-driver/cdp-browser-analyze-jd.mjs <cdp> https://example.com/

npm run desktop:driver -- quit

```



## 代码小改（同工作树，未 commit）



- `scripts/support/coolto-desktop-session.mjs`：dev launch 默认本地 API

- `scripts/run-dev-desktop-login.mjs`：QA `--user-data-dir` + 本地 API



## 遗留



- **H**：需在含匹配报告的 JD 上打开 artifact 面板再验 CTA（或补 QA 种子数据）。

- **E**：可选补托盘图标/全局快捷键人工一眼。

- **G**：可选补一条真实 `fetch_public_https_text` 发送验收（当前仅 UI 起草）。


