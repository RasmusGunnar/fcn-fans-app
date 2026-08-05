const MS_PER_HOUR = 1000 * 60 * 60;

export type FeedFreshnessKind = 'weekly_top_fan' | 'community';

export type EventFreshnessInput = {
  createdAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
};

export const FEED_FRESHNESS_RANKING = {
  weeklyTopFan: {
    firstDayHours: 24,
    strongBoostHours: 72,
    weekHours: 24 * 7,
    initialBoost: 110,
    firstDayEndBoost: 80,
    strongEndBoost: 36,
  },
  community: {
    firstDayHours: 24,
    moderateBoostHours: 72,
    initialBoost: 72,
    firstDayEndBoost: 48,
    moderateEndBoost: 16,
  },
  event: {
    discoveryHours: 24,
    discoveryMidpointHours: 12,
    initialDiscoveryBoost: 34,
    midpointDiscoveryBoost: 24,
    proximityWindowHours: 48,
    proximityDayHours: 24,
    proximitySoonHours: 6,
    proximityWindowBoost: 8,
    proximityDayBoost: 32,
    proximitySoonBoost: 64,
    proximityStartBoost: 84,
    postStartDecayHours: 3,
  },
} as const;

export type StableFeedRank = {
  score: number;
  sortTimestamp: number;
  kind: string;
  id: string;
};

function interpolate(
  value: number,
  start: number,
  end: number,
  startValue: number,
  endValue: number,
): number {
  if (end <= start) return endValue;
  const progress = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return startValue + (endValue - startValue) * progress;
}

function toAgeHours(timestamp: string | null | undefined, now: Date): number | null {
  if (!timestamp) return null;
  const occurredAt = new Date(timestamp).getTime();
  if (!Number.isFinite(occurredAt)) return null;
  return Math.max(0, (now.getTime() - occurredAt) / MS_PER_HOUR);
}

function toTimestamp(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : null;
}

export function getEventFreshnessBoost(
  { createdAt, startAt, endAt }: EventFreshnessInput,
  now = new Date(),
): number {
  const curve = FEED_FRESHNESS_RANKING.event;
  const ageHours = toAgeHours(createdAt, now);
  let discoveryBoost = 0;

  if (ageHours !== null && ageHours <= curve.discoveryMidpointHours) {
    discoveryBoost = interpolate(
      ageHours,
      0,
      curve.discoveryMidpointHours,
      curve.initialDiscoveryBoost,
      curve.midpointDiscoveryBoost,
    );
  } else if (ageHours !== null && ageHours <= curve.discoveryHours) {
    discoveryBoost = interpolate(
      ageHours,
      curve.discoveryMidpointHours,
      curve.discoveryHours,
      curve.midpointDiscoveryBoost,
      0,
    );
  }

  const startTimestamp = toTimestamp(startAt);
  if (startTimestamp === null) return discoveryBoost;

  const nowTimestamp = now.getTime();
  const endTimestamp = toTimestamp(endAt);
  if (endTimestamp !== null && endTimestamp <= nowTimestamp) {
    return 0;
  }

  const hoursToStart = (startTimestamp - nowTimestamp) / MS_PER_HOUR;
  let proximityBoost = 0;

  if (hoursToStart <= 0) {
    const hoursSinceStart = Math.abs(hoursToStart);
    if (hoursSinceStart < curve.postStartDecayHours) {
      return interpolate(
        hoursSinceStart,
        0,
        curve.postStartDecayHours,
        curve.proximityStartBoost,
        0,
      );
    }
    return 0;
  } else if (hoursToStart <= curve.proximitySoonHours) {
    proximityBoost = interpolate(
      hoursToStart,
      0,
      curve.proximitySoonHours,
      curve.proximityStartBoost,
      curve.proximitySoonBoost,
    );
  } else if (hoursToStart <= curve.proximityDayHours) {
    proximityBoost = interpolate(
      hoursToStart,
      curve.proximitySoonHours,
      curve.proximityDayHours,
      curve.proximitySoonBoost,
      curve.proximityDayBoost,
    );
  } else if (hoursToStart <= curve.proximityWindowHours) {
    proximityBoost = interpolate(
      hoursToStart,
      curve.proximityDayHours,
      curve.proximityWindowHours,
      curve.proximityDayBoost,
      curve.proximityWindowBoost,
    );
  }

  return discoveryBoost + proximityBoost;
}

export function getFeedFreshnessBoost(
  kind: FeedFreshnessKind,
  timestamp: string | null | undefined,
  now = new Date(),
): number {
  const ageHours = toAgeHours(timestamp, now);
  if (ageHours === null) return 0;

  if (kind === 'weekly_top_fan') {
    const curve = FEED_FRESHNESS_RANKING.weeklyTopFan;
    if (ageHours <= curve.firstDayHours) {
      return interpolate(
        ageHours,
        0,
        curve.firstDayHours,
        curve.initialBoost,
        curve.firstDayEndBoost,
      );
    }
    if (ageHours <= curve.strongBoostHours) {
      return interpolate(
        ageHours,
        curve.firstDayHours,
        curve.strongBoostHours,
        curve.firstDayEndBoost,
        curve.strongEndBoost,
      );
    }
    if (ageHours <= curve.weekHours) {
      return interpolate(
        ageHours,
        curve.strongBoostHours,
        curve.weekHours,
        curve.strongEndBoost,
        0,
      );
    }
    return 0;
  }

  const curve = FEED_FRESHNESS_RANKING.community;
  if (ageHours <= curve.firstDayHours) {
    return interpolate(
      ageHours,
      0,
      curve.firstDayHours,
      curve.initialBoost,
      curve.firstDayEndBoost,
    );
  }
  if (ageHours <= curve.moderateBoostHours) {
    return interpolate(
      ageHours,
      curve.firstDayHours,
      curve.moderateBoostHours,
      curve.firstDayEndBoost,
      curve.moderateEndBoost,
    );
  }
  return 0;
}

export function compareStableFeedRanks(left: StableFeedRank, right: StableFeedRank): number {
  if (right.score !== left.score) return right.score - left.score;
  if (right.sortTimestamp !== left.sortTimestamp) {
    return right.sortTimestamp - left.sortTimestamp;
  }
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
  return left.id.localeCompare(right.id);
}

export function dedupeByStableKey<T>(items: readonly T[], getKey: (item: T) => string): T[] {
  const itemsByKey = new Map<string, T>();
  items.forEach((item) => itemsByKey.set(getKey(item), item));
  return Array.from(itemsByKey.values());
}
