# Coolto 服务器推送、部署与发版规范

> 本文件是 Coolto 全端共享的运维与发版规范，四端 `local-docs/` 各存一份相同副本：
> `cv-agent-app`（桌面端）、`cv-agent-be`（主 API）、`cv-agent-admin`（Admin）、
> `cv-agent-api-service`（Credit）。任何修改必须四端同步。
> 桌面端打包/加固/签名细节见 [`desktop-release-hardening-runbook.md`](./desktop-release-hardening-runbook.md)，
> 本文件只覆盖服务器推送、部署与发版流程。

## 1. 总体架构

单台生产服务器（`43.132.228.181`，Ubuntu + Docker + Caddy，域名 `*.coolto.com.cn`）。
三个 Compose 项目（`cv-agent-app-be`、`cv-agent-admin`、`cv-agent-api-service`）共享 Caddy
与 Docker 网络，共五个公网入口：

| 域名 | 上游 | 用途 |
|---|---|---|
| `hkapi.coolto.com.cn` | `api:8080` | 主 API（/v1） |
| `home.coolto.com.cn` | 静态站 + `api:8080` | 官网；`/v1` 同源反代（Cookie 鉴权免 CORS）；`/downloads/` 托管更新源 |
| `credit.coolto.com.cn` | `cv-agent-api-service-prod-api-1:8081` | Credit API（额度/支付/网关） |
| `newapi.coolto.com.cn` | `coolto-new-api:3000` | New API LLM 网关（OpenAI 兼容） |
| `A1f3J0.coolto.com.cn` | `cv-agent-admin-prod-api-1:8082` | Admin 后台（创始人内部工具） |

Caddyfile 由 `cv-agent-app-be` 仓库（main 分支）管理并提交到 git；服务器上禁止本地改动
（见 §7 坑位）。官网静态文件在服务器 `~/cv-agent-app-be/website-dist`，bind mount 进
caddy 容器 `/srv/coolto-website`（只读）。

## 2. 仓库、分支与部署链路

代码在 GitHub 组织 `JsChen766` 的两个仓库，注意 **cv-agent 是一个仓库、三个分支承载三个服务**：

| 端 | 仓库 | 分支 | CI workflow | 服务器脚本 | 健康检查 |
|---|---|---|---|---|---|
| 主 API（be） | cv-agent | `main` | Main CI and production deploy | `/usr/local/bin/cv-agent-deploy` | `hkapi.coolto.com.cn/health/ready`（8080） |
| Admin | cv-agent | `admin` | Admin CI and production deploy | `/usr/local/bin/cv-agent-admin-deploy` | `127.0.0.1:8082/health/ready` |
| Credit | cv-agent | `credit-api-main` | Credit API CI and production deploy | `/usr/local/bin/coolto-credit-deploy` | `127.0.0.1:8081` + new-api 内部 + `credit.coolto.com.cn` |
| 桌面端 app | cv_agent_frontend | `app` | Build Windows/MacOS Release（workflow 定义在 `main`，dispatch 时选 `app`） | CI 直传 `/srv/coolto-releases` | 更新 feed `latest.yml` / `latest-mac.yml` |
| 官网 | cv_agent_frontend | `HomePage-Web` | Deploy Homepage（workflow 定义在 `main`） | CI 替换 `website-dist` | `home.coolto.com.cn` 200 + `<title>Coolto` |

桌面端源码在 `cv_agent_frontend/app` 分支（当前 0.1.8）；`main` 分支存放发布 workflow 定义
（`win-release.yml`、`mac-release.yml`、`homepage-deploy.yml`）；官网源码在 `HomePage-Web`
分支的 `homepage-web/` 子目录。`Coolto-Homepage` 仓库只承载官网 README/文档，不参与构建部署。

## 3. 分支保护（禁止直接推送）

以下分支全部启用 GitHub 分支保护：**禁止直接推送（含管理员）**，代码必须走 Pull Request 合入；
approvals 数 0（只要求 MR 形式），`enforce_admins=true`，禁止 force push 与删除分支：

- `cv-agent`：`main`（be CI）、`admin`（admin CI）、`credit-api-main`（credit CI）
- `cv_agent_frontend`：`main`（workflow 定义）、`app`（桌面端源码）

例外：`HomePage-Web` 未启用保护（可直推），但官网改动仍建议走 PR 留痕。
注意：**workflow 文件本身也受保护**——改 CI 也要提 PR，合入后才生效。

## 4. 后端三端：push 即部署

三个后端共用同一模式：**合入受保护分支 → GitHub Actions 质量门 → SSH 调服务器脚本部署 → 健康检查**。
由 CI 传入精确 40 位 commit SHA，服务器脚本只部署「当前分支最新提交」：

1. 质量门：`make check`（lint/gofmt/vet）+ `make test` 或容器内 `go test -race ./...`；
2. 部署门（credit 额外）：同步生产环境变量与密钥（`scripts/update-production-env.sh`、
   `scripts/ensure-new-api-secrets.sh`、爱发电 webhook 公钥），并审计 `.env.prod` 无
   `<CHANGE_ME` 占位符（出现即 fail，exit 4）；
3. SSH 调用 `/usr/local/bin/<end>-deploy <sha>`；
4. 健康检查：be 公共 `hkapi.coolto.com.cn/health/ready`；admin 本地 `127.0.0.1:8082/health/ready`；
   credit 本地 8081 + 容器内 new-api 就绪 + 公共 `credit.coolto.com.cn`（受
   `CREDIT_PUBLIC_READINESS_ENABLED` 变量控制）；均 30×2s 轮询；
5. 部署开关：admin/credit 分别受仓库变量 `ADMIN_DEPLOY_ENABLED` / `CREDIT_DEPLOY_ENABLED`
   控制（`true` 才执行部署 job），开关关闭时仍跑质量门；
6. credit 部署失败时自动收集远端诊断（容器状态、日志关键字：postgres/redis/公钥/配置/就绪），
   便于快速定位失败阶段。

### 服务器部署脚本契约（三个脚本同构）

- 入参必须是完整 40 位 SHA；非当前分支头拒绝部署（be：exit 5；credit：exit 1）；
- 校验 origin URL 与脏工作树——**服务器 tracked 文件（Caddyfile、compose.prod.yaml、
  .env.prod）有本地改动即拒绝**（be：exit 4）。生产配置一律提交进 git，服务器上禁止手工改；
- `flock` 互斥锁：同一时间每个服务只允许一个部署，锁占用时拒绝（be：exit 3）；
- 执行顺序：fetch → checkout 精确 SHA → `compose config --quiet` → build（api/migrate，
  credit 先 `docker builder prune`）→ 向前 migration（**只 up，禁止自动 down**）→
  `up -d --remove-orphans` → caddy 校验/重建 → 就绪轮询；
- 失败处理：保留现场（容器、迁移状态、日志），打印 previous SHA 供追溯，退出非 0；
  be 有 SHA 黑名单机制（exit 7，拦截含越权变更的合并）。
- 首次部署：admin 走 `/srv/cv-agent-admin/deploy_admin.sh`（生成密钥 + bootstrap）；
  credit 脚本容忍已存在 `.env.prod`/`secrets`（gitignored）的非空目录。
- 回滚：脚本只接受当前分支头，旧 SHA 拒绝部署；回滚通过「新提交 revert」或人工在服务器
  checkout 旧 SHA 后手动 `compose build/up`。be 的状态目录
  `~/.local/state/cv-agent-app-be/` 记录 `current-sha` / `previous-sha` 便于追溯。

## 5. 桌面端发版（app）

### 5.1 版本号管理

- 版本号唯一来源：`cv_agent_frontend` 仓库 `app` 分支 `package.json` 的 `version`；
- 升版流程：从 `app` 拉 `bump/0.1.x` 分支 → 只改 `package.json` 版本号 → PR 合入 `app`；
- **已发布的版本禁止同版本重建**：每次正式构建生成随机 AES 密钥，同版本重复构建的
  SHA-256 不同，会导致已装客户端更新校验混乱；发现产物有问题应升版本重发。

### 5.2 发布流程（0.1.8 实测通过）

1. 合入版本 bump PR；
2. Actions → **Build Windows Release**（手动 dispatch，分支选 `app`）：
   `npm ci` → `native:build:win` → `desktop:build:protected` → NSIS x64 打包 →
   `verify-release-hardening` → `verify-windows-installer`（真实安装 + bootstrap + 卸载）→
   scp `latest.yml` + `Coolto-<v>-x64.exe(.blockmap)` 到服务器 → 拉取 `latest-mac.yml`
   重新生成下载页 → 上传 `/srv/coolto-releases/index.html`；
3. Actions → **Build macOS Release**（分支选 `app`）：macos-14 → 补装 x64 可选原生包
   （canvas/keyring）→ universal native 构建 → `--mac zip --x64 --arm64`（双架构独立 zip，
   **不用 universal 合并**）→ 逐 .app verify → scp 两个 zip + `latest-mac.yml` → 重新生成下载页；
   **顺序建议：先 win 后 mac**，这样下载页两次生成都同时列出双平台（任一 workflow 都会
   拉对方 feed 合并生成页面）；
4. Actions → **Deploy Homepage**：默认从服务器 `latest.yml` 读最新版本注入
   `VITE_RELEASE_VERSION` 构建官网（可用 `release-version` 输入覆盖）→ 备份
   `website-dist.bak-ci-<ts>` → 替换 `website-dist` → 冒烟校验 `<title>Coolto`；
5. 可选：更新 `Coolto-Homepage` 仓库 README 里的安装包直链。

### 5.3 更新链路与强制更新

- 更新源：`https://home.coolto.com.cn/downloads/`（electron-updater generic provider；
  Windows 用 `latest.yml` + NSIS 链路，macOS 用 `latest-mac.yml` + 自研 zip 替换链路）；
- 客户端 feed 地址在 `src/desktop/main/ipc.ts`，生产默认公网地址，开发默认
  `http://127.0.0.1:8099`（本地模拟，`dev-app-update.yml`），可被 `COOLTO_UPDATE_FEED_URL` 覆盖；
- **强制更新（0.1.8+）**：app 启动即静默检查（不依赖登录），发现新版本弹全屏不可关闭弹窗
  （检测到新版本 + 更新按钮，下载带进度，失败可重试）。≤0.1.7 的存量客户端下次启动也会
  被强制弹窗升级；发布新版本前确认该版本号已存在于服务器 feed，否则旧客户端会弹「无法更新」。

## 6. 官网部署

- 源码：`cv_agent_frontend` 仓库 `HomePage-Web` 分支 `homepage-web/`；
- 发布：Actions → **Deploy Homepage**（workflow 在 `main` 分支）→ 构建产物替换
  `/home/ubuntu/cv-agent-app-be/website-dist`（部署前自动备份为 `website-dist.bak-ci-*`，
  回滚即把备份拷回）；
- 下载页（`/downloads/`）：`/srv/coolto-releases/index.html` 由
  `cv-agent-app/scripts/generate-download-page.mjs` 从 `latest.yml`/`latest-mac.yml` 生成，
  win/mac 两个发布 workflow 上传后都会重新生成，**无需手工维护版本号**；
- 官网下载按钮版本号由 `VITE_RELEASE_VERSION` 注入，默认自动取服务器 feed 最新版。

## 7. 服务器目录与关键文件

| 路径 | 内容 |
|---|---|
| `/srv/coolto-releases/` | 更新源根目录：`latest.yml`、`latest-mac.yml`、`Coolto-<v>-x64.exe(.blockmap)`、`Coolto-<v>-mac.zip`(x64)、`Coolto-<v>-arm64-mac.zip`、`index.html`（下载页，root:root 0644） |
| `/home/ubuntu/cv-agent-app-be/` | be 服务仓库（main 分支）+ `website-dist/`（官网静态文件）+ `Caddyfile` + `compose.prod.yaml` |
| `/srv/cv-agent-admin/` | admin 服务仓库（admin 分支）+ `.env.prod`（gitignored） |
| `/srv/coolto-credit-api/` | credit 服务仓库（credit-api-main 分支）+ `.env.prod` + `secrets/afdian_public.pem`（均 gitignored，由 CI 同步） |
| `/usr/local/bin/{cv-agent-deploy,cv-agent-admin-deploy,coolto-credit-deploy}` | 服务器端部署脚本（CI 经 SSH 调用） |
| `~/.local/state/cv-agent-app-be/` | be 部署状态：`current-sha` / `previous-sha` |

服务器访问：CI 使用仓库 Secrets 里的部署密钥（`RELEASE_SERVER_SSH_KEY` /
`DEPLOY_SSH_PRIVATE_KEY`）；人工运维走工作区 `scripts/ssh-run.py`（密码登录，带
`--upload`/`--download`）。**凭证不入任何仓库**。

## 8. 发布后验证清单

每次发版（尤其桌面端）按序验证：

1. `curl -s https://home.coolto.com.cn/downloads/latest.yml` → `version` 为新版本；
2. `latest-mac.yml` 同为新版本；
3. 下载页 `home.coolto.com.cn/downloads/` 显示「最新版本：X」且 win/mac 按钮齐全；
4. 安装包 URL 直连 200：`Coolto-<v>-x64.exe`、`Coolto-<v>-mac.zip`、`Coolto-<v>-arm64-mac.zip`；
5. `home.coolto.com.cn` 200 且 `<title>Coolto`（官网已部署）；
6. 三个后端公共健康检查通过：`hkapi.coolto.com.cn/health/ready`、
   `credit.coolto.com.cn/health/ready`、admin 本地 `127.0.0.1:8082/health/ready`；
7. （推荐）装一台旧版本客户端实测：启动即弹强制更新 → 更新 → 重启后为新版本。

## 9. 运维注意事项（坑）

- **Caddy 改配置必须 `docker compose up -d --force-recreate caddy`**：bind mount 单文件被
  `install` 替换（新 inode）后容器仍读旧文件，`caddy reload` 也无效；这是部署脚本里
  caddy 单独 force-recreate 的原因；
- **`verify:installer:win` 会真实安装并卸载目标版本**——不要在做更新链路实测期间重跑本地
  打包验证，会把已装实例删掉；
- **feed 一致性**：`latest.yml` 的 exe/sha512/blockmap 必须来自同一次构建；覆盖上传时三者
  要一起换，否则 electron-updater sha512 校验失败；
- **迁移只向前**：部署脚本自动 up、永不自动 down；迁移失败保留现场，按失败阶段人工恢复；
- **部署锁**：每个服务一个 flock，CI 与手工部署同时跑会互斥（be 报 exit 3）；
- **服务器工作树必须干净**：任何 `compose.prod.yaml`/`Caddyfile` 修改都要提交进 git 再部署，
  服务器上直接改会导致下次部署被拒（exit 4），历史上已踩过（deploy failure exit 4）；
- **只部署分支最新提交**：脚本校验请求 SHA == 当前分支头，手动部署前先
  `git fetch` 确认最新 SHA；
- **官网回滚**：`website-dist.bak-ci-*` 是最近一次部署的备份，把备份内容拷回即可；
- **分支保护覆盖 CI 文件**：改 workflow 也要提 PR，合入后新流程才生效；
- **改 download 页/官网/feed 后立即验证**（§8），发布链路任一步失败都要报告真实现象，
  不能以局部通过代替端到端验证。
