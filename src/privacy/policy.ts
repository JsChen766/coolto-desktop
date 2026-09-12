import { PRIVACY_POLICY_VERSION, type PrivacyPolicyView } from "./types.js";

export const PRIVACY_POLICY_CONTENT = [
  "1. Coolto 仅在用户主动发起任务时，将任务相关的经历、JD、简历内容发送给大语言模型处理。",
  "2. 业务数据（经历、JD、简历、投递记录）加密存储在用户本地及 Coolto 云端服务；对话与临时分析仅保存在本机，不写入云端。",
  "3. 登录凭证保存在系统凭据库，验证码与密码不会以明文保存在本机。",
  "4. 用户有权查看数据使用说明、导出自己的内容，并在「设置 → 隐私与数据」中清除本地数据。",
  "5. 不同意本协议将无法使用 Coolto；已同意后可在设置页随时查看。",
] as const;

export const PRIVACY_POLICY_CONTENT_HASH =
  "30521add8e9658ff045bfcca9db58c14cee14d5be4b15c13b93641bb566b7c3a";

export const BUNDLED_PRIVACY_POLICY: PrivacyPolicyView = {
  policyVersion: PRIVACY_POLICY_VERSION,
  contentHash: PRIVACY_POLICY_CONTENT_HASH,
  effectiveAt: "2026-09-08T00:00:00Z",
  changeClass: "major",
};
