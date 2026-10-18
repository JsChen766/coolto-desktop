import { PRIVACY_POLICY_VERSION, type PrivacyPolicyView } from "./types.js";

export const PRIVACY_POLICY_CONTENT = [
  "1. Coolto 仅在用户主动发起任务时，将任务相关的经历、JD、简历内容发送给大语言模型处理。",
  "2. 业务数据（经历、JD、简历、投递记录）仅加密存储在用户本机；开源 Desktop 不连接 Coolto 云；对话与临时分析仅保存在本机。",
  "3. API Key 与登录凭证保存在系统凭据库；验证码与密码不会以明文保存在本机。",
  "4. 用户有权查看数据使用说明、导出自己的内容，并在「设置 → 隐私与数据」中清除本地数据。",
  "5. 不同意本协议将无法使用 Coolto；已同意后可在设置页随时查看。",
] as const;

/** Hash of JSON.stringify(PRIVACY_POLICY_CONTENT); bump with major policy edits. */
export const PRIVACY_POLICY_CONTENT_HASH =
  "5af1597678b149ff25c46f7cd2900552231db00c8501d59a645b6407f667ca1a";

export const BUNDLED_PRIVACY_POLICY: PrivacyPolicyView = {
  policyVersion: PRIVACY_POLICY_VERSION,
  contentHash: PRIVACY_POLICY_CONTENT_HASH,
  effectiveAt: "2026-10-18T00:00:00Z",
  changeClass: "major",
};
