export function assertMailConnectionsBelongToAccount(
  mailConnectionIds: readonly string[],
  availableConnectionIds: ReadonlySet<string>,
): void {
  if (mailConnectionIds.some((id) => !availableConnectionIds.has(id))) {
    throw new Error("邮件 Loop 包含不存在或不属于当前账号的邮箱连接");
  }
}
