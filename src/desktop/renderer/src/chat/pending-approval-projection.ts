import type { DesktopApprovalRequest } from "../../../shared/types.js";

export async function refreshPendingApproval(
  conversationId: string,
  cache: Map<string, DesktopApprovalRequest>,
  read: (conversationId: string) => Promise<DesktopApprovalRequest[]>,
): Promise<DesktopApprovalRequest | undefined> {
  const pending = await read(conversationId);
  const latest = pending.reduce<DesktopApprovalRequest | undefined>(
    (current, request) => !current || request.createdAt > current.createdAt
      ? request
      : current,
    undefined,
  );
  if (latest) cache.set(conversationId, latest);
  else cache.delete(conversationId);
  return latest;
}
