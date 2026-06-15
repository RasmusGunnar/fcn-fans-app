export const HOME_POST_FETCH_LIMIT = 25;

export function buildHomePostFeedTargetFilter(): string {
  return [
    `feed_targets.cs.${JSON.stringify(['home'])}`,
    'feed_targets.is.null',
    `feed_targets.eq.${JSON.stringify([])}`,
  ].join(',');
}

export function isHomePostFeedTargets(value: unknown): boolean {
  if (value == null) {
    return true;
  }

  return Array.isArray(value) && (value.length === 0 || value.includes('home'));
}

export function selectHomePostRows<T extends { feed_targets?: unknown }>(
  rows: readonly T[],
  limit = HOME_POST_FETCH_LIMIT,
): T[] {
  return rows.filter((row) => isHomePostFeedTargets(row.feed_targets)).slice(0, limit);
}
