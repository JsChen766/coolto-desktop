# Coolto 桌面端加固打包运行手册

本文件面向后续 Agent 和发布维护者。涉及 Windows/macOS 打包、源码保护、安装器验证、签名或自动更新时，
必须先阅读本文件，再检查当前工作树、`package.json`、`electron-builder.yml` 和正式 Roadmap。历史数值仅用于
追溯；重新构建后应以当轮自动验证和文件哈希为准。

## 1. 当前目标和安全边界

当前方案的目标是提高静态提取和普通逆向的成本，同时保持 Windows x64 与 macOS Universal 的跨机器兼容性。
它不是不可破解的 DRM，也不能承诺专业逆向者永远拿不到运行时明文。

| 对手/动作 | 当前防护效果 |
| --- | --- |
| 直接解开 `app.asar` 查主进程源码 | 只能看到小型 loader 和 AES-GCM 密文，不能直接读取 Main 源码 |
| 修改密文、替换 Rust 模块或重打 ASAR | AES-GCM、原生模块哈希、ASAR integrity 和 Electron Fuses 会 fail-closed |
| 一般 JavaScript 静态分析 | 主进程依赖合并、压缩后整体加密；核心质量算法在 Rust 中 |
| 专业动态调试、进程注入、内存抓取 | 仍可能在运行时截获或分析，不得宣称绝对不可破解 |
| Renderer/Preload 静态分析 | 仅压缩且无 source map，不是同等级加密；敏感算法和长期密钥不得放在这里 |

ASAR 本身只是归档，不是加密。真正的主进程保护来自每次正式构建生成的随机 256-bit 密钥、
AES-256-GCM 密文和 Rust 内部认证解密执行。

## 2. 发布架构

正式构建链如下：

```text
TypeScript Main
  → electron-vite 单文件 CJS（ESM-only 依赖和动态块必须内联）
  → AES-256-GCM 加密为 out/main/index.bin
  → out/main/index.cjs 替换为小型完整性校验 loader
  → 随机密钥编入当轮 Rust/NAPI release 模块
  → electron-builder 打入 ASAR + extraResources/native/coolto-core.node
  → Fuses/ASAR/密文/原生导出审计
  → 平台安装或 Bundle 验收
```

Rust 的 `runProtectedMain` 在原生模块内认证、解密并执行 Main。正式模块不得导出返回明文 Buffer/String 的
解密 API，尤其不得重新增加 `decryptProtectedMain`。

## 3. 关键文件

| 文件 | 职责 |
| --- | --- |
| `electron.vite.config.ts` | Main 单文件 CJS、ESM-only 依赖内联、压缩和 native SHA 注入 |
| `scripts/build-native-core.mjs` | 生成当轮随机密钥，构建 Windows x64 或 macOS 双架构 Rust 模块 |
| `native/coolto-core/build.rs` | 将构建密钥校验后编入 Rust；直接开发构建才允许固定 fallback key |
| `native/coolto-core/src/lib.rs` | AES-GCM 认证解密、V8 执行和原生质量算法 |
| `scripts/protect-main-bundle.mjs` | 加密完整 Main、生成 loader、阻止已知 ESM-only 包残留为 `require()` |
| `scripts/verify-release-hardening.mjs` | 检查 ASAR、密文、额外 Main 块、原生接口、source map 和 Electron Fuses |
| `scripts/verify-windows-installer.mjs` | 隔离安装、哈希对比、真实 bootstrap/Renderer 验收、卸载清理 |
| `electron-builder.yml` | ASAR、Fuses、平台目标、原生 extraResources、签名和更新源 |
| `.github/workflows/macos-universal.yml` | macOS Universal 构建、双架构和 ad-hoc 签名验证 |

`native/coolto-core/artifacts/` 已被 `.gitignore` 忽略，其中 `.main-key` 是临时构建秘密。不得打印、提交、
上传或复制到发行包；只允许构建脚本读取。

## 4. 不得打乱的发布顺序

### 4.1 通用准备

1. 阅读 `AGENTS.md`、本文件和正式 Roadmap 的当前记录。
2. 检查 `git status`，保留用户已有改动，确认本次版本号。
3. 运行 `npm run check`。
4. 检查生产依赖风险；需要联网时使用 npm 官方 registry。
5. 再运行平台正式打包命令。

重要：`npm run check` 的最后一步是普通 `desktop:build`，会把 `out/main/index.cjs` 重新生成成明文构建结果。
因此发布产物必须由后续 `package:win` 或 `package:mac:*` 重新执行受保护构建。不能在正式打包后又运行
`desktop:build`，然后把 `out/` 当作已加密产物检查或分发。

### 4.2 Windows Intel/AMD x64

正式命令：

```powershell
npm run check
npm run package:win
```

`package:win` 必须完整执行以下链路：

```text
native:build:win
→ desktop:build:protected
→ electron-builder --win nsis --x64
→ verify:release:win
→ verify:installer:win
```

不要为了节省时间把一次旧 Rust 构建的 `.main-key`/`.node` 当成新版本正式产物。每次正式发布应运行完整
`package:win`，让密钥和原生模块成对刷新。随机密钥会使同版本重复构建的 SHA-256 不同；一旦产物已经对外
发布，需要重建时应提升版本号，避免同版本多哈希。

安装器验收不是“进程存活 10 秒”。它必须：

1. 静默安装到工作区内的隔离目录。
2. 对比安装后 EXE/ASAR 与 `win-unpacked` 哈希。
3. 等待安装文件稳定，再启动独立 user-data 实例。
4. 收到 `COOLTO_MAIN_BOOTSTRAP_READY`，证明 Rust 解密后的 Main 已同步执行完成。
5. 继续保持 Renderer 正常运行，且没有早退。
6. 精确终止测试进程树、静默卸载并确认隔离目录清理。

不得通过 `--disable-gpu` 让正式冒烟测试绕过 Renderer/GPU 路径。最终仍需在一台正常 Intel/AMD x64
Windows 机器上卸载失败旧版、正常点击安装并人工启动一次。

### 4.3 macOS Universal

Windows 不能可信地产出或验收 Universal、`lipo`、DMG 和 codesign 结果。必须在 macOS 构建机或现有
GitHub Actions 工作流执行：

```bash
npm run check
npm run package:mac:dmg
```

`native:build:mac` 必须在同一轮随机密钥下分别构建 arm64/x64，再用 `lipo` 合并原生模块。验证至少包括：

- `Coolto.app/Contents/MacOS/Coolto` 同时含 `arm64` 和 `x86_64`；
- `Contents/Resources/native/coolto-core.node` 同时含两种架构；
- `verify:release:mac` 通过；
- `codesign --verify --deep --strict` 通过；
- DMG/ZIP 和更新元数据被上传为同一轮 artifact。

当前 macOS 使用 ad-hoc 签名，未 notarize。在 Actions 真正运行通过以前，不得把 macOS Universal 标记为
实测完成。

## 5. 自动门禁必须保留

发布审计至少应持续拒绝以下情况：

- ASAR 内存在产品 `.ts`、`.tsx`、`.vue`、source map 或 `.cjsc`；
- `out/main` 除 `index.cjs` loader 和 `index.bin` 密文外还有其他代码块；
- 密文缺少 `CLTOENC1` header、尺寸异常或可直接检出受保护提示词；
- loader 超出合理上限，暗示主逻辑重新进入明文 loader；
- Rust 模块缺失、过小、缺少 `runProtectedMain` 或暴露明文解密接口；
- ASAR integrity、OnlyLoadAppFromAsar、Cookie encryption 等预期 Fuse 状态漂移；
- Windows 安装副本没有完成真实 bootstrap，或只停在 Electron 错误对话框。

增加新的 ESM-only 主进程依赖时，不能只验证开发模式和普通 build。必须确认它被 Main bundle 内联，或提供
真正兼容 CJS 的导出，再运行完整安装包验收。

## 6. 已知失败与禁止回退

### 0.1.0：`cachedDataRejected`

V8 `.cjsc` cached data 与构建环境耦合，在另一台 Intel/AMD x64 Windows 上被拒绝。禁止恢复 electron-vite
bytecode 作为通用发行壳，也不得把“在构建机可运行”当作跨机器兼容证据。

### 0.1.1：`ERR_PACKAGE_PATH_NOT_EXPORTED`

`pi-ai` 和 `pi-agent-core` 只提供 ESM import，但当时被 externalize 为 CJS `require()`。同时旧冒烟测试只看
进程是否退出，错误对话框仍会让进程保持存在，从而产生假阳性。当前配置必须继续内联这两个依赖和动态块，
测试必须继续依赖 bootstrap 标记。

### NSIS 安装后立即启动的 GPU 子进程短暂失败

安装目录和 `win-unpacked` 文件完整一致时，安装器刚退出即启动可能遇到 Windows/安全软件仍占用新释放 DLL。
当前测试保留短暂落盘稳定期，但不禁用 GPU。如果稳定期后仍失败，应检查完整 stderr、运行库和文件哈希，
不得单纯延长等待时间掩盖持续性故障。

## 7. 签名、分发和更新限制

- Windows 当前 `NotSigned`，SmartScreen/“未知发布者”提示仍可能出现；加密壳不能替代 Authenticode。
- macOS 当前仅 ad-hoc 签名，Gatekeeper 提示仍可能出现；正式外部分发应使用 Developer ID 并 notarize。
- 免费自签名证书不能建立公有系统信任，不能承诺不提示。
- `electron-builder.yml` 的更新源目前仍是 `http://127.0.0.1:8099`。在用户提供准确 HTTPS 发布地址并重打包
  以前，不得宣称自动更新已可用于公网发行。
- 安装包只应从受控网站/GitHub Release 提供，并同时公布版本、平台、架构、文件大小和 SHA-256。

签名和更新地址变更都属于发布配置决策。后续 Agent 必须先向用户确认确切证书方案和 HTTPS 地址，不能猜测。

## 8. 当前已验证基线

截至 2026-08-14，本地 Windows 已验证版本为 `0.1.2`：

- 目标：Windows Intel/AMD x64；
- 安装器：`dist-electron/Coolto-0.1.2-x64.exe`；
- 大小：136,002,609 bytes；
- SHA-256：`5CC790085FE3620165EBFDA789D7FA3D62C4CFCE071B3DCE43FC98475288ABF9`；
- Rust tests：3/3；
- 项目测试：460 passed、0 failed、2 skipped（macOS-only）；
- ASAR：仅 1,097-byte Main loader 和 853,561-byte Main 密文；
- 原生模块：262,144 bytes；
- Fuses：自动审计通过；
- NSIS：隔离安装、真实 bootstrap、Renderer 保持运行、卸载和清理通过；
- Authenticode：`NotSigned`。

这些数字只描述该次构建。任何重新执行完整打包都会生成新密钥和新哈希，必须同步更新本节与正式 Roadmap。

## 9. Agent 交付清单

每次发布任务结束前，Agent 应明确报告：

1. 实际运行了哪些完整命令，哪些平台只能留待对应系统验证。
2. `npm run check`、Rust tests、release audit、安装/Bundle 验收的真实结果。
3. 产物绝对路径、版本、架构、大小和 SHA-256。
4. Authenticode/codesign/notarization 的真实状态。
5. 是否仍使用 localhost 更新源。
6. 哪些代码被加密、哪些仅压缩，以及动态逆向仍存在的边界。
7. 是否 commit、是否 push；没有用户明确授权时不得执行。
8. 把真实结果、失败与遗留项写回正式 Roadmap，不能因局部测试通过提前标记完成。

## 10. 自动更新与发布源（2026-08-15 起）

### 10.1 发布源架构

- 服务器：`43.132.228.181`（Ubuntu 24.04 + Docker + Caddy），域名 `*.coolto.com.cn`。
- 发布目录：`/srv/coolto-releases/`（root:root 0644），经 Caddy 路由
  `home.coolto.com.cn/downloads/` 静态托管（见 `cv-agent-app-be/Caddyfile` 与
  `compose.prod.yaml` 的 caddy volumes）。
- 更新 feed（electron-updater generic provider）：
  - Windows：`https://home.coolto.com.cn/downloads/latest.yml`
  - macOS：`https://home.coolto.com.cn/downloads/latest-mac.yml`
- 客户端 feed URL：`src/desktop/main/ipc.ts` —— 生产默认
  `https://home.coolto.com.cn/downloads/`，开发（unpackaged）默认
  `http://127.0.0.1:8099`（本地模拟），可被 `COOLTO_UPDATE_FEED_URL` 覆盖。
- 官网下载页：`/srv/coolto-releases/index.html`（由
  `cv-agent-app/scripts/generate-download-page.mjs` 生成，从
  `latest.yml`/`latest-mac.yml` 自动读取版本与产物名）。

### 10.2 客户端更新链路（0.1.3+）

- Windows：electron-updater 原生 NSIS 链路。`autoDownload=true`，
  `update-available` 后由 electron-updater 下载 `.exe`（校验 latest.yml 的
  sha512），`update-downloaded` 事件进入 `downloaded` 阶段，用户点击安装时
  调用 `quitAndInstall()`（静默运行安装器并重启）。平台分支在
  `src/desktop/main/update/electron-update-service.ts`（`nativeWindowsFlow`）。
- macOS：保留自研 zip 链路（下载 zip → ditto 解压 → bash 替换 .app → 重启）。
- 状态机阶段：`idle → checking → available → downloading → downloaded →
  installing / error`，经 IPC `updates:event` 推送到渲染端。

### 10.3 Windows 发布流程（GitHub Actions，与 macOS 一致）

- Workflow：`cv_agent_frontend` 仓库 `.github/workflows/win-release.yml`（main 分支）。
- 手动触发：GitHub → Actions → Build Windows Release → Run workflow → 选 `app` 分支。
- 流程：windows-latest → npm ci → native:build:win（MSVC）→
  desktop:build:protected → electron-builder --win nsis --x64 → verify release →
  verify installer（真实安装 + bootstrap + 卸载，脚本自包含，CI 可跑）→
  scp latest.yml + exe + blockmap → 从服务器拉 latest-mac.yml 重新生成下载页 →
  上传 index.html。
- 本地等效流程（无 CI 时）：
  `npm run package:win` → `node scripts/generate-download-page.mjs` → 上传
  latest.yml + exe + blockmap + index.html → /srv/coolto-releases/。

### 10.4 macOS 发布流程（GitHub Actions）

- Workflow：`cv_agent_frontend` 仓库 `.github/workflows/mac-release.yml`（main 分支）。
- 手动触发：GitHub → Actions → Build macOS Release → Run workflow → 选 `app` 分支。
- 流程：macos-14 (arm64) → npm ci → 强制安装 x64 可选原生包
  （@napi-rs/canvas-darwin-x64、@napi-rs/keyring-darwin-x64，--force 跳过
  EBADPLATFORM）→ native:build:mac（universal）→ desktop:build:protected →
  electron-builder --mac zip --x64 --arm64（双架构独立 zip；universal 合并
  无法处理 canvas/keyring 这类第三方双架构 napi 包，故不用 universal）→
  对每个 .app 跑 verify → scp 两个 zip + latest-mac.yml → sudo install 到
  /srv/coolto-releases/。
- 产物：`Coolto-<v>-mac.zip`（x64，文件名无 arch 标记，electron-updater 默认
  按 x64 匹配）+ `Coolto-<v>-arm64-mac.zip`；latest-mac.yml 含两个 files 条目。
- Secrets（仓库级）：`RELEASE_SERVER_SSH_KEY`（专用 ed25519 私钥，公钥在服务器
  `~/.ssh/authorized_keys`，标签 `coolto-mac-ci`）、`RELEASE_SERVER_HOST`、
  `RELEASE_SERVER_USER`。
- 限制：macOS 构建必须在 macOS 主机上（`build-native-core.mjs` 强制校验
  darwin/arm64），Windows 构建只能在 Windows 主机上。CI 产物未签名
  （`identity: "-"`）。

### 10.5 已验证基线（2026-08-15）

- Windows 端到端更新实测通过：0.1.3 已装客户端 → 手动检查 → 自动下载 0.1.4
  （130MB，sha512 校验）→ `quitAndInstall` 静默安装 → 新实例自动重启，
  版本 0.1.4。app.asar 版本校验一致。
- 更新检查：`https://home.coolto.com.cn/downloads/latest.yml` 公网可访问。

### 10.6 运维注意事项（坑）

- 改 Caddyfile 后必须 `docker compose up -d --force-recreate caddy`：bind mount
  单文件被 `install` 替换（新 inode）后，容器仍读旧文件；`caddy reload` 读到的
  也是旧挂载。重建容器才重新挂载。
- `package:win` 里的 `verify:installer:win` 会真实安装并**卸载**目标版本——
  不要在验证更新链路期间重新打包（会把已装实例删掉）。
- `latest.yml` 里 `releaseDate` 由 electron-builder 生成；覆盖上传时保持
  exe/sha512/blockmap 三者一致，否则 electron-updater 校验失败。
