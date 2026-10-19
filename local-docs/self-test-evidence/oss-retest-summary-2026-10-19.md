# 开源自测补测小结（2026-10-19 Asia/Shanghai）

仓：`/workspace/coolto-desktop-local` · 分支 `dev/app-complete`  
四块补测完成时 HEAD：`95fe51d93391fe3630df7fbe80a29917271dd74e`  
本小结以 `docs(oss): retest summary…` 叠于其上（以 `git rev-parse HEAD` 为准）。  
**未 push**；相对 `origin/dev/app-complete` 本地超前。公开仓 URL **仍等主人提供**（见 `local-docs/oss-publish-checklist.md`）。

## 四块结果

| 块 | 结论 | 证据 | Commit |
|----|------|------|--------|
| **§4 导出** | **PASS** — `DataExportService`→写盘→解密对账；OSS 本机 sync 业务资产入库 | `section-4-export-full/` | `7182409` |
| **Linux 包 / 冷启动** | **builder PASS**；GUI 冷启动需 `COOLTO_ALLOW_PLAINTEXT_SAFE_STORAGE=1`（box 无 keyring）；缺 `coolto-core` 已跳过哈希 | `section-5-linux-package-gui/` | `72706c1` |
| **Win / Mac 打包** | **全 deferred** — 配置/脚本齐；box 冒烟至 wine ENOENT / `@electron/universal` 仅 darwin；未宣称安装成功 | `section-5-win-mac-package/` | `3f01b71` |
| **求职站 fixture** | **qa:job-scout + browser-agent PASS**（搜岗 + fixture 填表/提交/回执）；真登录投递 **deferred** | `section-1-job-scout/` | `95fe51d` |

## 相对门闩还缺什么

| 项 | 状态 |
|----|------|
| 公开仓 URL + 首次 push / 粘贴 beginner issues | **仍等**主人 URL（checklist 已就绪，勿空 push） |
| Win / Mac 真机 `package:*` + 安装校验 | **deferred**（需对应 OS；公证可选） |
| Linux 正式包生产 keyring（无 plaintext env） | 真机桌面 secret service；box 冒烟靠 env |
| candidate 真站登录 / OTP / CAPTCHA 投递 | **deferred**（BOSS/JobsDB/LinkedIn 仍 `candidate`；开源以 fixture 为准） |
| §8 面试训练 / §11 站点记忆 | 产品未宣称，保持 deferred |

## 一句话

fixture 与 Linux 包/导出主路径已可复现绿；跨平台真机包与真登录投递仍 deferred，且公开仓未 push。
