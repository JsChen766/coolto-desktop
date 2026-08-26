const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|system|developer) instructions?/iu,
  /disregard (the )?(rules|policy|instructions?)/iu,
  /(reveal|print|send|upload|exfiltrate).{0,80}(password|token|cookie|secret|resume|email)/iu,
  /忽略.{0,20}(之前|系统|开发者|规则|指令)/u,
  /(发送|上传|泄露|输出).{0,40}(密码|令牌|cookie|密钥|简历|邮箱)/iu,
];

export function mailSecurityFlags(value: string): string[] {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(value))
    ? ["prompt_injection_suspected"]
    : [];
}
