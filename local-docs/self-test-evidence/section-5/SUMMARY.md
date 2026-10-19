# §5 跨平台安装与更新 — 自测证据（2026-10-18 Asia/Shanghai）

## 验收项对照

| 验收项 | 现状 | 本轮改动 |
|--------|------|----------|
| README 给出 Win/mac/Linux 开发启动与最小运行步骤 | README「桌面开发与跨平台安装」 | 是（补 `package:linux` 说明） |
| 配置用户自备 API 后可完成主路径 | 指向 checklist / `.env.example` | 沿用 |
| 平台能力拒绝时有降级说明 | README 降级表 | 沿用 |
| **Linux 打包冒烟（本轮加严）** | `npm run package:linux` → AppImage + `linux-unpacked` | 是 |

## Linux box 冒烟（2026-10-18 Asia/Shanghai）

```text
npm run package:linux
# = desktop:build && electron-builder --linux AppImage --x64
# EXIT 0
# 产物：
#   dist-electron/Coolto-0.1.27-x86_64.AppImage (~227M)
#   dist-electron/linux-unpacked/coolto-local-agent
```

成功标准：**builder 成功** ✓。

补充启动探测（无桌面 / 无 Linux coolto-core 原生保护模块时）：进程进入主进程 JS，随后因「正式包缺少原生保护模块哈希」与 keyring 不可用而失败——属 box 环境限制，不否定 builder 成功。完整 GUI 启动需本机密钥环 +（若启用保护）对应平台原生模块。

详见 `linux-package-smoke.log` / `readme-install-scan.log`。

## Deferred（明确不阻断 P0）

| 项 | 状态 |
|----|------|
| Win 真机 `package:win` / 安装器 | **deferred**（需 Windows） |
| Mac 真机 `package:mac*` / 公证 | **deferred**（需 macOS；公证可选） |
| Authenticode / Apple 公证 | 可选；见 release hardening runbook |
| 完整自动更新 infra | 开源版自行管理版本（README） |

## 后续加深（2026-10-19）

unpacked 冷启动 GUI、原生哈希 / keyring 根因与 workaround：见 [`../section-5-linux-package-gui/SUMMARY.md`](../section-5-linux-package-gui/SUMMARY.md)。

## Win/Mac 边界（2026-10-19）

脚本/配置存在；Linux box 冒烟至 wine / darwin-universal 硬阻断；完整安装 **deferred**。详见 [`../section-5-win-mac-package/SUMMARY.md`](../section-5-win-mac-package/SUMMARY.md)。

