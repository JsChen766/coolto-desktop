export function allocateResumeBulletId(
  itemId: string,
  existingIds: readonly string[],
): string {
  const prefix = `${itemId}-bullet-`;
  const occupied = new Set(existingIds);
  let next = existingIds.reduce((maximum, bulletId) => {
    if (!bulletId.startsWith(prefix)) return maximum;
    const suffix = Number.parseInt(bulletId.slice(prefix.length), 10);
    return Number.isInteger(suffix) ? Math.max(maximum, suffix) : maximum;
  }, 0) + 1;
  while (occupied.has(`${prefix}${next}`)) next += 1;
  return `${prefix}${next}`;
}
