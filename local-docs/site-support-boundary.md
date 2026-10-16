# 招聘站点与搜岗来源支持边界

本文档描述本仓库**当前代码**对招聘站点与搜岗来源的支持边界，与
`src/browser/recruiting-site-policy.ts` 及 Job Scout 实现保持一致。

**禁止**将下列内容表述为「稳定全自动投递」或「已正式支持生产投递」。真实站点提交仍须按站点逐域验收；登录、OTP、CAPTCHA、法律声明与敏感问题必须由用户接管。

## 1. Job Scout 搜岗来源（不是已 verified 投递站点）

| 来源 | 角色 | 说明 |
|------|------|------|
| **Greenhouse** | Job Scout API 搜岗 | 通过 Greenhouse Job Board API 拉取公开职位列表，供搜索、去重、匹配与 Shortlist。 |
| **Lever** | Job Scout API 搜岗 | 通过 Lever Postings API 拉取公开职位列表，用途同上。 |

Greenhouse / Lever 在本产品中是 **Job Scout 的授权搜岗来源**，用于发现与整理岗位线索。它们**不是** `recruiting-site-policy.ts` 中的 `verified` 投递站点，也**不得**写成已验收的一键投递目标。

## 2. 候选招聘站点（`status: candidate`，`verifiedAt: null`）

下列站点在 `RECRUITING_SITE_POLICIES` 中均为 **`candidate`**，且 **`verifiedAt` 为空**：

| siteId | 名称 | 生产 origin（参考） |
|--------|------|---------------------|
| `boss_zhipin` | BOSS 直聘（候选） | `https://www.zhipin.com` |
| `jobsdb_hk` | JobsDB 香港（候选） | `https://hk.jobsdb.com` |
| `linkedin` | LinkedIn（候选） | `https://www.linkedin.com` |

### 候选站点允许叙述的能力

对 `candidate` 站点，运行时仅允许与下列能力相关的叙述与行为（见
`CANDIDATE_ALLOWED_CAPABILITIES`）：

- **read** — 只读观察 / 读取页面信息
- **match** — 与本机经历 / JD 的匹配分析
- **takeover_required** — 需用户接管的表面（登录、OTP、CAPTCHA、法律声明、敏感问题、提交确认等）

填写（fill）、上传（upload）、字段审核（field_review）、无人值守提交等**不得**写成候选站点上的稳定能力。即便策略对象上声明了更广的 `capabilities` 列表，未 `verified` 时也不会按已验证站点放行。

### 明确否认

- **不是**已 verified 的正式投递站点。
- **禁止**宣传为稳定全自动投递或已正式支持。
- 密码写入、OTP 代填、CAPTCHA 破解、法律代勾、敏感身份代答、无人值守提交等均为拒绝动作。

## 3. 文档与产品文案约定

- README、Issue、PR、对外说明提到站点时，须区分「搜岗来源」与「投递站点状态」。
- 新增或升级站点支持时，以更新 `recruiting-site-policy.ts`（含 `status` / `verifiedAt`）为准，并同步修订本文档。
- 有疑问时以本文件与策略源码为准，不以营销措辞为准。
