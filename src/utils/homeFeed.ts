import type { CommunityFeedSource } from '../services/communityFeedApi';
import type { BusTrip, Event } from '../services/eventsApi';
import type { FanActivity } from '../services/fanActivities';
import { logger } from '../lib/logger';
import { targetKey } from './targetKey';
import type { FeedFanActivityData, FeedItem, FeedWeeklyTopFanData } from '../types/feed';
import type { NewsItem } from '../types/news';
import type { Post } from '../types/post';

const COPENHAGEN_TIMEZONE = 'Europe/Copenhagen';
const WEEKLY_TOP_FAN_PUBLISH_HOUR = 12;
const MS_PER_HOUR = 1000 * 60 * 60;
const HOME_FEED_RANKING_DEBUG =
  __DEV__ && process.env.EXPO_PUBLIC_HOME_FEED_RANKING_DEBUG?.trim().toLowerCase() === 'true';
export const HOME_FEED_AUDIT_DEBUG_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_HOME_FEED_AUDIT_DEBUG?.trim().toLowerCase() === 'true';

export const HOME_RANKING_V1 = {
  recency: {
    maxPoints: 72,
    windowHours: 96,
    freshnessFloorHours: 2,
    freshnessFloorPoints: 38,
  },
  engagement: {
    likeWeight: 1,
    commentWeight: 2,
    systemVoteWeight: 1,
    maxPoints: 20,
  },
  polls: {
    activeBoost: 22,
    decayFloor: 0.55,
  },
  events: {
    liveWindowHours: 3,
    liveBoost: 10,
    verySoonHours: 6,
    soonHours: 24,
    upcomingHours: 72,
    thisWeekHours: 168,
    verySoonBoost: 30,
    soonBoost: 22,
    upcomingBoost: 12,
    thisWeekBoost: 5,
  },
  weeklyTopFan: {
    validWeekBoost: 10,
    recencyMultiplier: 0.22,
  },
  community: {
    recencyMultiplier: 0.55,
    freshBoostHours: 48,
    freshBoost: 8,
    maxAgeHours: 24 * 14,
  },
  fanActivities: {
    recencyMultiplier: 0.68,
    parentUpcomingBoost: 10,
    likelyUpcomingMatchParentBoost: 7,
    verySoonHours: 6,
    soonHours: 24,
    upcomingHours: 72,
    verySoonBoost: 16,
    soonBoost: 10,
    upcomingBoost: 5,
    liveWindowHours: 2,
    liveBoost: 4,
    ctaBoost: 4,
    startedDecayHours: 6,
    startedDecayMultiplier: 0.32,
    endedDecayMultiplier: 0.12,
    maxAgeAfterCompletionHours: 18,
    topWindow: 8,
    maxInTopWindow: 2,
    sameParentTopWindow: 6,
    thinFeedThreshold: 4,
  },
  stability: {
    scoreBucketSize: 1,
  },
  guardrails: {
    topWindow: 3,
    maxSystemCardsInTopWindow: 1,
    communityTopWindow: 10,
    maxCommunityItemsInTopWindow: 1,
    maxCommunityItemsOverall: 2,
  },
  debug: {
    enabled: HOME_FEED_RANKING_DEBUG,
    maxLoggedItems: 12,
  },
} as const;

type FeedSourceParams = {
  posts: Post[];
  newsItems: NewsItem[];
  events: Event[];
  busTrips: BusTrip[];
  fanActivities?: FanActivity[];
  communityFeedEntries?: CommunityFeedSource[];
  weeklyTopFanItem?: FeedWeeklyTopFanData | null;
  baseDate?: Date;
};

type LikeMap = Record<string, { liked: boolean; likes: number }>;
type CommentCountMap = Record<string, number>;
type HomeFeedAuditEvent = {
  stage: 'filtered' | 'deferred' | 'dropped' | 'deduped';
  communityId: string;
  reason: string;
  createdAt?: string | null;
  sortDate?: string | null;
  debugSource?: string | null;
  score?: number;
};
type HomeFeedAuditContext = {
  events: HomeFeedAuditEvent[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidFeedItem(item: unknown): item is FeedItem {
  if (!isRecord(item)) {
    return false;
  }

  return (
    typeof item.kind === 'string' &&
    typeof item.id === 'string' &&
    isRecord(item.data)
  );
}

function sanitizeFeedItems(
  items: readonly unknown[],
  stage: string,
): FeedItem[] {
  const validItems = items.filter(isValidFeedItem);

  if (__DEV__ && validItems.length !== items.length) {
    logger.warn('[homeFeed] Dropped invalid feed items.', {
      stage,
      received: items.length,
      kept: validItems.length,
    });
  }

  return validItems;
}

function toIsoOrNull(value?: string | null): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function countFeedKinds(items: readonly unknown[]): Record<string, number> {
  return sanitizeFeedItems(items, 'countFeedKinds').reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {});
}

function pushHomeFeedAuditEvent(
  context: HomeFeedAuditContext | undefined,
  event: HomeFeedAuditEvent,
) {
  if (!HOME_FEED_AUDIT_DEBUG_ENABLED || !context) {
    return;
  }

  context.events.push(event);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getCopenhagenTimeParts(baseDate: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COPENHAGEN_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(baseDate);

  const readPart = (type: string) => parts.find((part) => part.type === type)?.value || '';

  return {
    weekday: readPart('weekday'),
    year: Number(readPart('year') || '0'),
    month: Number(readPart('month') || '0'),
    day: Number(readPart('day') || '0'),
    hour: Number(readPart('hour') || '0'),
  };
}

function getWeekStartDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function getLatestPublishedWeeklyTopFanWeekStart(baseDate = new Date()): string {
  const copenhagen = getCopenhagenTimeParts(baseDate);
  const currentWeekStart = getWeekStartDate(copenhagen.year, copenhagen.month, copenhagen.day);

  // Backend publishes the previous completed week on Monday 12:00 Copenhagen.
  // Before that window, the latest published row is still the one from two weeks back.
  const daysBack =
    copenhagen.weekday === 'Mon' && copenhagen.hour < WEEKLY_TOP_FAN_PUBLISH_HOUR ? 14 : 7;

  return addDays(currentWeekStart, -daysBack);
}

export function isHomePost(post: Pick<Post, 'feedTargets'>): boolean {
  const feedTargets = Array.isArray(post.feedTargets) ? post.feedTargets : [];
  return feedTargets.includes('home') || feedTargets.length === 0;
}

export function getHomeSortDate(item: FeedItem): string | null {
  switch (item.kind) {
    case 'post':
      return item.data.sortDate ?? item.data.createdAt ?? null;
    case 'news':
      return item.data.sortDate ?? item.data.createdAt ?? null;
    case 'event':
      return item.data.sortDate ?? item.data.eventStartAt ?? item.data.startAt ?? item.data.createdAt ?? null;
    case 'bus_trip':
      return item.data.sortDate ?? item.data.eventStartAt ?? item.data.startAt ?? item.data.createdAt ?? null;
    case 'match':
      return item.data.sortDate ?? item.data.eventStartAt ?? item.data.kickoffAt ?? null;
    case 'community':
      return item.data.sortDate ?? item.data.createdAt ?? null;
    case 'fan_activity':
      return item.data.sortDate ?? item.data.startsAt ?? item.data.createdAt ?? null;
    case 'weekly_top_fan':
      return item.data.sortDate ?? item.data.generatedAt ?? item.data.createdAt ?? null;
    default:
      return null;
  }
}

function isFanActivityItem(
  item: FeedItem | null | undefined,
): item is Extract<FeedItem, { kind: 'fan_activity' }> {
  return isValidFeedItem(item) && item.kind === 'fan_activity';
}

function getFanActivityParentKey(item: Extract<FeedItem, { kind: 'fan_activity' }>): string {
  return `${item.data.parentType}:${item.data.parentId}`;
}

export function getFeedItemCreatedAt(item: FeedItem): string | null {
  switch (item.kind) {
    case 'post':
    case 'news':
    case 'community':
      return item.data.createdAt ?? null;
    case 'event':
    case 'bus_trip':
    case 'fan_activity':
      return item.data.createdAt ?? null;
    case 'weekly_top_fan':
      return item.data.createdAt ?? null;
    default:
      return null;
  }
}

function isValidWeeklyTopFanForHome(item: FeedItem, baseDate = new Date()): boolean {
  if (item.kind !== 'weekly_top_fan') return false;
  const hasRequiredData = Boolean(
    item.data.id &&
      item.data.userId &&
      (item.data.weekStartDate || item.data.generatedAt || item.data.createdAt),
  );

  if (!hasRequiredData) {
    console.log('[homeFeed] dropping weekly_top_fan due to missing required data', {
      id: item.id,
      weekStartDate: item.data.weekStartDate ?? null,
      userId: item.data.userId ?? null,
    });
    return false;
  }

  console.log('[homeFeed] allowing weekly_top_fan into home feed', {
    id: item.id,
    weekStartDate: item.data.weekStartDate,
    latestExpectedWeekStart: getLatestPublishedWeeklyTopFanWeekStart(baseDate),
  });
  return true;
}

function isWeeklyTopFanItem(
  item: FeedItem | RankedHomeFeedEntry | null | undefined,
): boolean {
  if (!item) return false;
  return 'item' in item ? item.item.kind === 'weekly_top_fan' : item.kind === 'weekly_top_fan';
}

function compareFeedItemsByDate(a: FeedItem, b: FeedItem): number {
  const timeDiff = toTimestamp(getHomeSortDate(b)) - toTimestamp(getHomeSortDate(a));
  if (timeDiff !== 0) return timeDiff;

  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
  return a.id.localeCompare(b.id);
}

export function sortFeedItemsByDate(items: FeedItem[]): FeedItem[] {
  return [...sanitizeFeedItems(items, 'sortFeedItemsByDate')].sort(compareFeedItemsByDate);
}

function dedupeFeedItems(items: FeedItem[]): FeedItem[] {
  const map = new Map<string, FeedItem>();
  sanitizeFeedItems(items, 'dedupeFeedItems').forEach((item) => {
    map.set(`${item.kind}:${item.id}`, item);
  });
  return Array.from(map.values());
}

function getHomeRecencyDate(item: FeedItem): string | null {
  switch (item.kind) {
    case 'post':
    case 'news':
      return item.data.createdAt ?? item.data.sortDate ?? null;
    case 'event':
    case 'bus_trip':
      return item.data.createdAt ?? null;
    case 'weekly_top_fan':
      return item.data.generatedAt ?? item.data.createdAt ?? null;
    case 'match':
      return item.data.sortDate ?? item.data.kickoffAt ?? null;
    case 'community':
      return item.data.createdAt ?? item.data.sortDate ?? null;
    case 'fan_activity':
      return item.data.createdAt ?? item.data.startsAt ?? item.data.sortDate ?? null;
    default:
      return null;
  }
}

function getRecencyScore(item: FeedItem, now: Date): number {
  const recencyDate = getHomeRecencyDate(item);
  if (!recencyDate) return 0;

  const ageHours = Math.max(0, (now.getTime() - toTimestamp(recencyDate)) / MS_PER_HOUR);
  const cappedAgeHours = Math.min(ageHours, HOME_RANKING_V1.recency.windowHours);
  const remainingRatio = 1 - cappedAgeHours / HOME_RANKING_V1.recency.windowHours;
  const recencyScore = HOME_RANKING_V1.recency.maxPoints * Math.max(0, remainingRatio);

  if (item.kind === 'post' && ageHours <= HOME_RANKING_V1.recency.freshnessFloorHours) {
    return Math.max(recencyScore, HOME_RANKING_V1.recency.freshnessFloorPoints);
  }

  if (item.kind === 'community') {
    return recencyScore * HOME_RANKING_V1.community.recencyMultiplier;
  }

  if (item.kind === 'weekly_top_fan') {
    return recencyScore * HOME_RANKING_V1.weeklyTopFan.recencyMultiplier;
  }

  if (item.kind === 'fan_activity') {
    const startsAt = toTimestamp(item.data.startsAt ?? null);
    const endsAt = toTimestamp(item.data.endsAt ?? null);

    if (endsAt && endsAt <= now.getTime()) {
      return recencyScore * HOME_RANKING_V1.fanActivities.endedDecayMultiplier;
    }

    if (
      startsAt &&
      startsAt <= now.getTime() &&
      (now.getTime() - startsAt) / MS_PER_HOUR > HOME_RANKING_V1.fanActivities.startedDecayHours
    ) {
      return recencyScore * HOME_RANKING_V1.fanActivities.startedDecayMultiplier;
    }

    return recencyScore * HOME_RANKING_V1.fanActivities.recencyMultiplier;
  }

  return recencyScore;
}

function getEngagementScore(item: FeedItem): number {
  if (item.kind === 'weekly_top_fan') {
    return 0;
  }

  const likeCount = Math.max(0, item.data.likeCount ?? 0);
  const commentCount = Math.max(0, item.data.commentCount ?? 0);
  const votesCount = 0;
  const engagementCount =
    likeCount * HOME_RANKING_V1.engagement.likeWeight +
    commentCount * HOME_RANKING_V1.engagement.commentWeight +
    votesCount * HOME_RANKING_V1.engagement.systemVoteWeight;

  return Math.min(
    engagementCount,
    HOME_RANKING_V1.engagement.maxPoints,
  );
}

function getPollBoost(item: FeedItem, now: Date): number {
  if (item.kind !== 'post' || !item.data.isActivePoll) return 0;

  const expiresAt = toTimestamp(item.data.expiresAt ?? item.data.poll_data?.expires_at ?? null);
  if (expiresAt && expiresAt <= now.getTime()) {
    return 0;
  }

  const createdAt = toTimestamp(item.data.createdAt ?? null);
  const fallbackDurationHours = Math.max(
    1,
    (expiresAt - Math.max(createdAt, 0)) / MS_PER_HOUR,
  );
  const totalDurationHours = Math.max(
    1,
    (item.data.poll_data?.duration ?? 0) * 24 || fallbackDurationHours,
  );
  const remainingHours = Math.max(0, (expiresAt - now.getTime()) / MS_PER_HOUR);
  const remainingRatio = Math.min(1, remainingHours / totalDurationHours);
  const decayFactor = Math.max(HOME_RANKING_V1.polls.decayFloor, remainingRatio);

  return HOME_RANKING_V1.polls.activeBoost * decayFactor;
}

function getEventTimeWindowBoost(item: FeedItem, now: Date): number {
  if (item.kind !== 'event' && item.kind !== 'bus_trip') return 0;

  const startAt = toTimestamp(item.data.eventStartAt ?? item.data.startAt ?? null);
  if (!startAt) return 0;

  const endAt = toTimestamp(item.data.eventEndAt ?? null);
  if (endAt && endAt <= now.getTime()) {
    return 0;
  }

  const hoursToStart = (startAt - now.getTime()) / MS_PER_HOUR;
  if (hoursToStart < 0) {
    const hoursSinceStart = Math.abs(hoursToStart);
    return hoursSinceStart <= HOME_RANKING_V1.events.liveWindowHours
      ? HOME_RANKING_V1.events.liveBoost
      : 0;
  }
  if (hoursToStart <= HOME_RANKING_V1.events.verySoonHours) {
    return HOME_RANKING_V1.events.verySoonBoost;
  }
  if (hoursToStart <= HOME_RANKING_V1.events.soonHours) {
    return HOME_RANKING_V1.events.soonBoost;
  }
  if (hoursToStart <= HOME_RANKING_V1.events.upcomingHours) {
    return HOME_RANKING_V1.events.upcomingBoost;
  }
  if (hoursToStart <= HOME_RANKING_V1.events.thisWeekHours) {
    return HOME_RANKING_V1.events.thisWeekBoost;
  }

  return 0;
}

function getWeeklyTopFanBoost(item: FeedItem, now: Date): number {
  if (!isValidWeeklyTopFanForHome(item, now)) return 0;
  return HOME_RANKING_V1.weeklyTopFan.validWeekBoost;
}

function getCommunityBoost(item: FeedItem, now: Date): number {
  if (item.kind !== 'community') return 0;

  const createdAt = toTimestamp(item.data.createdAt ?? null);
  if (!createdAt) return 0;

  const ageHours = Math.max(0, (now.getTime() - createdAt) / MS_PER_HOUR);
  return ageHours <= HOME_RANKING_V1.community.freshBoostHours
    ? HOME_RANKING_V1.community.freshBoost
    : 0;
}

function getFanActivityBoost(item: FeedItem, now: Date): number {
  if (!isFanActivityItem(item)) return 0;

  const startAt = toTimestamp(item.data.startsAt ?? null);
  const endAt = toTimestamp(item.data.endsAt ?? null);
  const hasCta = Boolean(item.data.ctaLabel?.trim() && item.data.ctaUrl?.trim());
  let boost = 0;

  if (item.data.parentIsUpcoming) {
    boost += HOME_RANKING_V1.fanActivities.parentUpcomingBoost;
  } else if (
    item.data.parentType === 'match' &&
    startAt &&
    startAt > now.getTime() &&
    (startAt - now.getTime()) / MS_PER_HOUR <= HOME_RANKING_V1.events.thisWeekHours
  ) {
    // Match parents are not part of the shared Home source set, so we proxy "upcoming"
    // through an activity that is clearly tied to the next few matchday windows.
    boost += HOME_RANKING_V1.fanActivities.likelyUpcomingMatchParentBoost;
  }

  if (startAt) {
    const hoursToStart = (startAt - now.getTime()) / MS_PER_HOUR;

    if (endAt && endAt > now.getTime() && hoursToStart < 0) {
      boost += HOME_RANKING_V1.fanActivities.liveBoost;
    } else if (hoursToStart >= 0 && hoursToStart <= HOME_RANKING_V1.fanActivities.verySoonHours) {
      boost += HOME_RANKING_V1.fanActivities.verySoonBoost;
    } else if (hoursToStart <= HOME_RANKING_V1.fanActivities.soonHours) {
      boost += HOME_RANKING_V1.fanActivities.soonBoost;
    } else if (hoursToStart <= HOME_RANKING_V1.fanActivities.upcomingHours) {
      boost += HOME_RANKING_V1.fanActivities.upcomingBoost;
    }
  }

  if (hasCta) {
    boost += HOME_RANKING_V1.fanActivities.ctaBoost;
  }

  return boost;
}

function isRelevantCommunityItem(item: FeedItem, now: Date): boolean {
  if (item.kind !== 'community') return true;

  const createdAt = toTimestamp(item.data.createdAt ?? null);
  if (!createdAt) return false;

  const ageHours = Math.max(0, (now.getTime() - createdAt) / MS_PER_HOUR);
  return ageHours <= HOME_RANKING_V1.community.maxAgeHours;
}

function isRelevantFanActivityItem(item: FeedItem, now: Date): boolean {
  if (!isFanActivityItem(item)) return true;

  const endsAt = toTimestamp(item.data.endsAt ?? null);
  const startsAt = toTimestamp(item.data.startsAt ?? null);
  const completedAt = endsAt || startsAt;

  if (!completedAt || completedAt > now.getTime()) {
    return true;
  }

  const ageHours = Math.max(0, (now.getTime() - completedAt) / MS_PER_HOUR);
  return ageHours <= HOME_RANKING_V1.fanActivities.maxAgeAfterCompletionHours;
}

export type HomeRankingScoreBreakdown = {
  recency: number;
  engagement: number;
  pollBoost: number;
  timeWindowBoost: number;
  weeklyTopFanBoost: number;
  communityBoost: number;
  fanActivityBoost: number;
  rawScore: number;
  finalScore: number;
};

function bucketHomeRankingScore(score: number): number {
  const bucketSize = HOME_RANKING_V1.stability.scoreBucketSize;
  if (bucketSize <= 0) return score;
  return Math.round(score / bucketSize) * bucketSize;
}

export function getHomeRankingBreakdown(
  item: FeedItem,
  now = new Date(),
): HomeRankingScoreBreakdown {
  const recency = getRecencyScore(item, now);
  const engagement = getEngagementScore(item);
  const pollBoost = getPollBoost(item, now);
  const timeWindowBoost = getEventTimeWindowBoost(item, now);
  const weeklyTopFanBoost = getWeeklyTopFanBoost(item, now);
  const communityBoost = getCommunityBoost(item, now);
  const fanActivityBoost = getFanActivityBoost(item, now);
  const rawScore =
    recency +
    engagement +
    pollBoost +
    timeWindowBoost +
    weeklyTopFanBoost +
    communityBoost +
    fanActivityBoost;

  return {
    recency,
    engagement,
    pollBoost,
    timeWindowBoost,
    weeklyTopFanBoost,
    communityBoost,
    fanActivityBoost,
    rawScore,
    finalScore: bucketHomeRankingScore(rawScore),
  };
}

export function getHomeRankingScore(item: FeedItem, now = new Date()): number {
  return getHomeRankingBreakdown(item, now).finalScore;
}

type RankedHomeFeedEntry = {
  item: FeedItem;
  score: number;
  sortTimestamp: number;
  breakdown: HomeRankingScoreBreakdown;
};

function compareRankedHomeFeedEntries(a: RankedHomeFeedEntry, b: RankedHomeFeedEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.sortTimestamp !== a.sortTimestamp) return b.sortTimestamp - a.sortTimestamp;
  return compareFeedItemsByDate(a.item, b.item);
}

function applyHomeRankingGuardrails(entries: RankedHomeFeedEntry[]): RankedHomeFeedEntry[] {
  const top: RankedHomeFeedEntry[] = [];
  const deferredWeeklyTopFanCards: RankedHomeFeedEntry[] = [];
  const deferredSystemCards: RankedHomeFeedEntry[] = [];
  const rest: RankedHomeFeedEntry[] = [];
  let systemCardsInTopWindow = 0;

  entries.forEach((entry) => {
    const isSystemCard = Boolean(entry.item.data.isSystemCard);

    if (top.length < HOME_RANKING_V1.guardrails.topWindow) {
      if (isWeeklyTopFanItem(entry)) {
        deferredWeeklyTopFanCards.push(entry);
        return;
      }

      if (
        isSystemCard &&
        systemCardsInTopWindow >= HOME_RANKING_V1.guardrails.maxSystemCardsInTopWindow
      ) {
        deferredSystemCards.push(entry);
        return;
      }

      top.push(entry);
      if (isSystemCard) {
        systemCardsInTopWindow += 1;
      }
      return;
    }

    rest.push(entry);
  });

  // Best effort: if the feed only contains systemcards we still need to return all items.
  while (
    top.length < HOME_RANKING_V1.guardrails.topWindow &&
    deferredSystemCards.length > 0
  ) {
    top.push(deferredSystemCards.shift()!);
  }

  return [...top, ...deferredWeeklyTopFanCards, ...deferredSystemCards, ...rest];
}

function applyHomeCommunityGuardrails(
  entries: RankedHomeFeedEntry[],
  auditContext?: HomeFeedAuditContext,
): RankedHomeFeedEntry[] {
  const overallLimited: RankedHomeFeedEntry[] = [];
  let communityItemsOverall = 0;

  entries.forEach((entry) => {
    if (entry.item.kind !== 'community') {
      overallLimited.push(entry);
      return;
    }

    if (communityItemsOverall >= HOME_RANKING_V1.guardrails.maxCommunityItemsOverall) {
      pushHomeFeedAuditEvent(auditContext, {
        stage: 'filtered',
        communityId: entry.item.data.communityId,
        reason: 'community_overall_limit',
        createdAt: entry.item.data.createdAt ?? null,
        sortDate: getHomeSortDate(entry.item),
        debugSource: entry.item.data.debugSource ?? null,
        score: entry.score,
      });
      return;
    }

    communityItemsOverall += 1;
    overallLimited.push(entry);
  });

  const finalEntries: RankedHomeFeedEntry[] = [];
  const deferredCommunityEntries: RankedHomeFeedEntry[] = [];
  let communityItemsInTopWindow = 0;

  overallLimited.forEach((entry) => {
    if (entry.item.kind === 'community') {
      if (
        finalEntries.length < HOME_RANKING_V1.guardrails.communityTopWindow &&
        communityItemsInTopWindow >= HOME_RANKING_V1.guardrails.maxCommunityItemsInTopWindow
      ) {
        deferredCommunityEntries.push(entry);
        pushHomeFeedAuditEvent(auditContext, {
          stage: 'deferred',
          communityId: entry.item.data.communityId,
          reason: 'community_top_window_limit',
          createdAt: entry.item.data.createdAt ?? null,
          sortDate: getHomeSortDate(entry.item),
          debugSource: entry.item.data.debugSource ?? null,
          score: entry.score,
        });
        return;
      }

      if (finalEntries.length < HOME_RANKING_V1.guardrails.communityTopWindow) {
        communityItemsInTopWindow += 1;
      }
    }

    finalEntries.push(entry);
  });

  finalEntries.push(...deferredCommunityEntries);

  return finalEntries;
}

function canPlaceFanActivityEntry(
  entry: RankedHomeFeedEntry,
  finalEntries: RankedHomeFeedEntry[],
  totalEntries: number,
): boolean {
  if (!isFanActivityItem(entry.item)) {
    return true;
  }

  const isThinFeed = totalEntries <= HOME_RANKING_V1.fanActivities.thinFeedThreshold;
  const currentIndex = finalEntries.length;
  const previousEntry = finalEntries[finalEntries.length - 1];

  if (!isThinFeed && previousEntry && isFanActivityItem(previousEntry.item)) {
    return false;
  }

  if (currentIndex < HOME_RANKING_V1.fanActivities.topWindow) {
    const topFanActivityCount = finalEntries
      .slice(0, HOME_RANKING_V1.fanActivities.topWindow)
      .filter((candidate) => isFanActivityItem(candidate.item)).length;

    if (topFanActivityCount >= HOME_RANKING_V1.fanActivities.maxInTopWindow) {
      return false;
    }
  }

  if (currentIndex < HOME_RANKING_V1.fanActivities.sameParentTopWindow) {
    const candidateParentKey = getFanActivityParentKey(entry.item);
    const hasSiblingFromSameParentInTopWindow = finalEntries
      .slice(0, HOME_RANKING_V1.fanActivities.sameParentTopWindow)
      .some(
        (candidate) =>
          isFanActivityItem(candidate.item) &&
          getFanActivityParentKey(candidate.item) === candidateParentKey,
      );

    if (hasSiblingFromSameParentInTopWindow) {
      return false;
    }
  }

  return true;
}

function applyHomeFanActivityGuardrails(entries: RankedHomeFeedEntry[]): RankedHomeFeedEntry[] {
  if (entries.length <= 1) {
    return entries;
  }

  const remaining = [...entries];
  const finalEntries: RankedHomeFeedEntry[] = [];

  while (remaining.length > 0) {
    const candidateIndex = remaining.findIndex((entry) =>
      canPlaceFanActivityEntry(entry, finalEntries, entries.length),
    );

    const [nextEntry] = remaining.splice(candidateIndex >= 0 ? candidateIndex : 0, 1);
    if (!nextEntry) {
      if (__DEV__) {
        logger.warn('[homeFeed] Skipped empty entry during fan_activity guardrail pass.');
      }
      continue;
    }

    finalEntries.push(nextEntry);
  }

  return finalEntries;
}

function logHomeFeedAudit(
  entries: RankedHomeFeedEntry[],
  auditContext: HomeFeedAuditContext | undefined,
  inputItems: FeedItem[],
  relevantItems: FeedItem[],
) {
  if (!HOME_FEED_AUDIT_DEBUG_ENABLED) return;

  const finalItems = entries.map((entry) => entry.item);
  logger.log('[homeFeed][audit][summary]', {
    inputCounts: countFeedKinds(inputItems),
    postFilterCounts: countFeedKinds(relevantItems),
    finalCounts: countFeedKinds(finalItems),
    communityAuditEvents: auditContext?.events ?? [],
  });

  logger.log(
    '[homeFeed][audit][final]',
    entries.slice(0, 20).map((entry, index) => ({
      rank: index + 1,
      id: entry.item.id,
      kind: entry.item.kind,
      createdAt: getFeedItemCreatedAt(entry.item),
      sortDate: getHomeSortDate(entry.item),
      score: entry.score,
      debugSource: entry.item.kind === 'community' ? entry.item.data.debugSource ?? null : null,
      isSystemCard: Boolean(entry.item.data.isSystemCard),
    })),
  );
}

function logHomeRankingDebug(entries: RankedHomeFeedEntry[]) {
  if (!HOME_RANKING_V1.debug.enabled) return;

  console.log(
    '[homeFeed][ranking]',
    entries.slice(0, HOME_RANKING_V1.debug.maxLoggedItems).map((entry, index) => ({
      rank: index + 1,
      id: entry.item.id,
      kind: entry.item.kind,
      score: entry.score,
      recency: entry.breakdown.recency,
      engagement: entry.breakdown.engagement,
      pollBoost: entry.breakdown.pollBoost,
      timeWindowBoost: entry.breakdown.timeWindowBoost,
      weeklyTopFanBoost: entry.breakdown.weeklyTopFanBoost,
      communityBoost: entry.breakdown.communityBoost,
      fanActivityBoost: entry.breakdown.fanActivityBoost,
      rawScore: entry.breakdown.rawScore,
      sortDate: getHomeSortDate(entry.item),
      isSystemCard: Boolean(entry.item.data.isSystemCard),
      debugSource: entry.item.kind === 'community' ? entry.item.data.debugSource ?? null : null,
    })),
  );
}

export function sortHomeFeedItems(items: FeedItem[], baseDate = new Date()): FeedItem[] {
  const auditContext = HOME_FEED_AUDIT_DEBUG_ENABLED ? { events: [] as HomeFeedAuditEvent[] } : undefined;
  const safeItems = sanitizeFeedItems(items, 'sortHomeFeedItems:input');
  let hasValidWeeklyTopFan = false;
  const relevantItems = safeItems.filter((item) => {
    if (item.kind === 'weekly_top_fan') {
      if (!isValidWeeklyTopFanForHome(item, baseDate)) {
        return false;
      }

      if (hasValidWeeklyTopFan) {
        console.log('[homeFeed] dropping duplicate weekly_top_fan item', {
          id: item.id,
          weekStartDate: item.data.weekStartDate,
        });
        return false;
      }

      hasValidWeeklyTopFan = true;
      console.log('[homeFeed] keeping weekly_top_fan item', {
        id: item.id,
        weekStartDate: item.data.weekStartDate,
      });
      return true;
    }

    if (item.kind === 'community') {
      const createdAt = item.data.createdAt ?? null;
      if (!createdAt || !toTimestamp(createdAt)) {
        pushHomeFeedAuditEvent(auditContext, {
          stage: 'filtered',
          communityId: item.data.communityId,
          reason: 'community_missing_created_at',
          createdAt,
          sortDate: getHomeSortDate(item),
          debugSource: item.data.debugSource ?? null,
        });
        return false;
      }

      if (!isRelevantCommunityItem(item, baseDate)) {
        pushHomeFeedAuditEvent(auditContext, {
          stage: 'filtered',
          communityId: item.data.communityId,
          reason: 'community_stale',
          createdAt,
          sortDate: getHomeSortDate(item),
          debugSource: item.data.debugSource ?? null,
        });
        return false;
      }
    }

    if (item.kind === 'fan_activity' && !isRelevantFanActivityItem(item, baseDate)) {
      return false;
    }

    return true;
  });

  const rankedEntries = relevantItems
    .map((item) => {
      const breakdown = getHomeRankingBreakdown(item, baseDate);

      return {
        item,
        score: breakdown.finalScore,
        sortTimestamp: toTimestamp(getHomeSortDate(item)),
        breakdown,
      };
    })
    .sort(compareRankedHomeFeedEntries);

  const guardedEntries = applyHomeFanActivityGuardrails(
    applyHomeCommunityGuardrails(applyHomeRankingGuardrails(rankedEntries), auditContext),
  );
  logHomeRankingDebug(guardedEntries);
  logHomeFeedAudit(guardedEntries, auditContext, safeItems, relevantItems);

  return guardedEntries.map((entry) => entry.item);
}

export function toPostFeedItem(post: Post, baseDate = new Date()): FeedItem {
  const sortDate = toIsoOrNull(post.createdAt);
  const expiresAt = toIsoOrNull(post.poll_data?.expires_at ?? null);
  const isActivePoll = Boolean(expiresAt && toTimestamp(expiresAt) > baseDate.getTime());
  const likeCount = typeof post.likesCount === 'number' ? post.likesCount : 0;
  const commentCount = typeof post.commentsCount === 'number' ? post.commentsCount : 0;

  return {
    kind: 'post',
    id: post.id,
    data: {
      ...post,
      sortDate,
      expiresAt,
      isActivePoll,
      isSystemCard: false,
      likeCount,
      commentCount,
      engagementCount: likeCount + commentCount,
    },
  };
}

function toNewsFeedItem(newsItem: NewsItem): FeedItem {
  const likeCount = typeof newsItem.likesCount === 'number' ? newsItem.likesCount : 0;
  const commentCount = typeof newsItem.commentsCount === 'number' ? newsItem.commentsCount : 0;

  return {
    kind: 'news',
    id: newsItem.id,
    data: {
      ...newsItem,
      sortDate: toIsoOrNull(newsItem.createdAt),
      isSystemCard: false,
      likeCount,
      commentCount,
      engagementCount: likeCount + commentCount,
    },
  };
}

function toEventFeedItem(event: Event): FeedItem {
  const startAt = toIsoOrNull(event.start_at ?? null);
  const endAt = toIsoOrNull(event.end_at ?? null);

  return {
    kind: 'event',
    id: event.id,
    data: {
      id: event.id,
      title: event.title,
      startAt,
      location: event.location_name ?? event.location_address ?? null,
      description: event.description ?? null,
      organizerName: event.organizer?.name ?? null,
      organizerGroupId: event.organizer_group_id ?? null,
      organizerType: event.organizer_type ?? null,
      organizerId: event.organizer_id ?? null,
      creatorUserId: event.creator_user_id ?? null,
      createdBy: event.created_by ?? null,
      createdAt: event.created_at ?? null,
      eventType: 'event',
      coverBucket: event.cover_bucket ?? null,
      coverPath: event.cover_path ?? null,
      sortDate: startAt ?? event.created_at ?? null,
      eventStartAt: startAt,
      eventEndAt: endAt,
      isSystemCard: false,
      likeCount: 0,
      commentCount: 0,
      engagementCount: 0,
    },
  };
}

function toBusTripFeedItem(busTrip: BusTrip): FeedItem {
  const startAt = toIsoOrNull(busTrip.start_at ?? null);
  const endAt = toIsoOrNull(busTrip.expected_return_at ?? null);
  const createdAt = toIsoOrNull(busTrip.created_at ?? null);

  return {
    kind: 'bus_trip',
    id: busTrip.id,
    data: {
      id: busTrip.id,
      title: busTrip.title,
      startAt,
      location: busTrip.departure_place ?? busTrip.departure_address ?? null,
      description: busTrip.description ?? null,
      organizerName: busTrip.organizer?.name ?? null,
      organizerGroupId: busTrip.organizer_group_id ?? null,
      organizerType: busTrip.organizer_group_id ? 'community' : null,
      organizerId: busTrip.organizer_group_id ?? null,
      createdAt,
      eventType: 'bus_trip',
      sortDate: startAt ?? createdAt,
      eventStartAt: startAt,
      eventEndAt: endAt,
      isSystemCard: false,
      likeCount: 0,
      commentCount: 0,
      engagementCount: 0,
    },
  };
}

function toFanActivityFeedItem(
  activity: FanActivity,
  upcomingEventIds: ReadonlySet<string>,
): FeedItem {
  const startsAt = toIsoOrNull(activity.starts_at ?? null);
  const endsAt = toIsoOrNull(activity.ends_at ?? null);
  const createdAt = toIsoOrNull(activity.created_at ?? null);

  return {
    kind: 'fan_activity',
    id: activity.id,
    data: {
      id: activity.id,
      parentType: activity.parent_type,
      parentId: activity.parent_id,
      parentIsUpcoming:
        activity.parent_type === 'event' ? upcomingEventIds.has(activity.parent_id) : undefined,
      type: activity.type,
      title: activity.title,
      body: activity.body ?? null,
      startsAt,
      endsAt,
      locationName: activity.location_name ?? null,
      locationAddress: activity.location_address ?? null,
      communityId: activity.community_id ?? null,
      communityName: activity.community?.name ?? null,
      coverUrl: activity.cover_url ?? null,
      ctaLabel: activity.cta_label ?? null,
      ctaUrl: activity.cta_url ?? null,
      registrationEnabled: activity.registration_enabled,
      registrationCapacity: activity.registration_capacity,
      registrationPriceDkk: activity.registration_price_dkk,
      registrationPaymentMode: activity.registration_payment_mode,
      registrationReservedCount: activity.registration_summary?.reservedCount ?? 0,
      createdAt,
      sortDate: startsAt ?? createdAt,
      likeCount: 0,
      commentCount: 0,
      engagementCount: 0,
      isSystemCard: false,
    } satisfies FeedFanActivityData,
  };
}

export function toCommunityFeedItem(
  community: CommunityFeedSource,
): FeedItem {
  const createdAt = toIsoOrNull(community.created_at) ?? '';

  return {
    kind: 'community',
    id: community.community_id,
    data: {
      id: community.community_id,
      communityId: community.community_id,
      name: community.name,
      description: community.description ?? null,
      createdAt,
      creatorId: community.created_by ?? null,
      avatarUrl: community.avatar_url ?? null,
      coverUrl: community.cover_url ?? null,
      debugSource: community.debug_source ?? null,
      sortDate: createdAt || null,
      // Community discovery cards should participate in home ranking,
      // but they should still respect the system-card guardrails near the top.
      isSystemCard: true,
      likeCount: 0,
      commentCount: 0,
      engagementCount: 0,
    },
  };
}

function toWeeklyTopFanFeedItem(item: FeedWeeklyTopFanData): FeedItem {
  const likeCount = item.likesCount ?? 0;
  const commentCount = item.commentsCount ?? 0;
  const votesCount = item.votesCount ?? 0;
  const sortDate = toIsoOrNull(item.generatedAt ?? item.createdAt ?? null);

  return {
    kind: 'weekly_top_fan',
    id: item.id,
    data: {
      ...item,
      sortDate,
      isSystemCard: true,
      likeCount,
      commentCount,
      engagementCount: likeCount + commentCount + votesCount,
    },
  };
}

export function buildFeedItemsFromSources({
  posts,
  newsItems,
  events,
  busTrips,
  weeklyTopFanItem,
  baseDate = new Date(),
}: FeedSourceParams): FeedItem[] {
  return sortFeedItemsByDate(
    sanitizeFeedItems(
      [
      ...(weeklyTopFanItem ? [toWeeklyTopFanFeedItem(weeklyTopFanItem)] : []),
      ...posts.map((post) => toPostFeedItem(post, baseDate)),
      ...newsItems.map((newsItem) => toNewsFeedItem(newsItem)),
      ...events.map((event) => toEventFeedItem(event)),
      ...busTrips.map((busTrip) => toBusTripFeedItem(busTrip)),
      ],
      'buildFeedItemsFromSources',
    ),
  );
}

export function buildHomeFeedItemsFromSources({
  posts,
  newsItems,
  events,
  busTrips,
  fanActivities = [],
  communityFeedEntries = [],
  weeklyTopFanItem,
  baseDate = new Date(),
}: FeedSourceParams): FeedItem[] {
  const upcomingEventIds = new Set(events.map((event) => event.id));
  const mappedHomeFeedItems = [
    ...buildFeedItemsFromSources({
      posts: posts.filter(isHomePost),
      newsItems,
      events,
      busTrips,
      weeklyTopFanItem,
      baseDate,
    }),
    ...fanActivities.map((activity) => toFanActivityFeedItem(activity, upcomingEventIds)),
    ...communityFeedEntries.map((community) => toCommunityFeedItem(community)),
  ];
  const rawHomeFeedItems = sanitizeFeedItems(mappedHomeFeedItems, 'buildHomeFeedItemsFromSources');
  const dedupedHomeFeedItems = dedupeFeedItems(rawHomeFeedItems);

  if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
    const duplicateCommunityEvents: HomeFeedAuditEvent[] = [];
    const duplicateKeys = new Map<string, number>();
    rawHomeFeedItems.forEach((item) => {
      const key = `${item.kind}:${item.id}`;
      duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
    });

    Array.from(duplicateKeys.entries())
      .filter(([, count]) => count > 1)
      .forEach(([key, count]) => {
        const [kind, id] = key.split(':');
        if (kind !== 'community') {
          return;
        }

        const duplicateItem = rawHomeFeedItems.find(
          (item): item is Extract<FeedItem, { kind: 'community' }> =>
            item.kind === 'community' && item.id === id,
        );
        duplicateCommunityEvents.push({
          stage: 'deduped',
          communityId: id,
          reason: `community_duplicate_before_dedupe:${count}`,
          createdAt: duplicateItem?.data.createdAt ?? null,
          sortDate: duplicateItem ? getHomeSortDate(duplicateItem) : null,
          debugSource:
            duplicateItem?.kind === 'community' ? duplicateItem.data.debugSource ?? null : null,
        });
      });

    logger.log('[homeFeed][audit][build]', {
      rawCounts: countFeedKinds(rawHomeFeedItems),
      dedupedCounts: countFeedKinds(dedupedHomeFeedItems),
      duplicateCommunityEvents,
      communitySources: communityFeedEntries.map((entry) => ({
        communityId: entry.community_id,
        createdAt: entry.created_at,
        debugSource: entry.debug_source ?? null,
      })),
    });
  }

  return sortHomeFeedItems(dedupedHomeFeedItems, baseDate);
}

export function withFeedEngagementSummary(
  items: FeedItem[],
  likeMap: LikeMap,
  commentCountMap: CommentCountMap,
): FeedItem[] {
  const safeItems = sanitizeFeedItems(items, 'withFeedEngagementSummary');

  return safeItems.map((item) => {
    switch (item.kind) {
      case 'weekly_top_fan': {
        const likeCount = item.data.likesCount ?? item.data.likeCount ?? 0;
        const commentCount = item.data.commentsCount ?? item.data.commentCount ?? 0;
        const votesCount = item.data.votesCount ?? 0;

        return {
          ...item,
          data: {
            ...item.data,
            likeCount,
            commentCount,
            engagementCount: likeCount + commentCount + votesCount,
          },
        };
      }

      case 'post': {
        const key = targetKey(item.kind, item.id);
        const likeCount = likeMap[key]?.likes ?? item.data.likeCount ?? item.data.likesCount ?? 0;
        const commentCount =
          commentCountMap[key] ?? item.data.commentCount ?? item.data.commentsCount ?? 0;

        return {
          ...item,
          data: {
            ...item.data,
            likesCount: likeCount,
            commentsCount: commentCount,
            likeCount,
            commentCount,
            engagementCount: likeCount + commentCount,
          },
        };
      }

      case 'news': {
        const key = targetKey(item.kind, item.id);
        const likeCount = likeMap[key]?.likes ?? item.data.likeCount ?? item.data.likesCount ?? 0;
        const commentCount =
          commentCountMap[key] ?? item.data.commentCount ?? item.data.commentsCount ?? 0;

        return {
          ...item,
          data: {
            ...item.data,
            likesCount: likeCount,
            commentsCount: commentCount,
            likeCount,
            commentCount,
            engagementCount: likeCount + commentCount,
          },
        };
      }

      case 'event': {
        const key = targetKey(item.kind, item.id);
        const likeCount = likeMap[key]?.likes ?? item.data.likeCount ?? 0;
        const commentCount = commentCountMap[key] ?? item.data.commentCount ?? 0;

        return {
          ...item,
          data: {
            ...item.data,
            likeCount,
            commentCount,
            engagementCount: likeCount + commentCount,
          },
        };
      }

      case 'bus_trip': {
        const key = targetKey(item.kind, item.id);
        const likeCount = likeMap[key]?.likes ?? item.data.likeCount ?? 0;
        const commentCount = commentCountMap[key] ?? item.data.commentCount ?? 0;

        return {
          ...item,
          data: {
            ...item.data,
            likeCount,
            commentCount,
            engagementCount: likeCount + commentCount,
          },
        };
      }

      case 'match': {
        const key = targetKey(item.kind, item.id);
        const likeCount = likeMap[key]?.likes ?? item.data.likeCount ?? 0;
        const commentCount = commentCountMap[key] ?? item.data.commentCount ?? 0;

        return {
          ...item,
          data: {
            ...item.data,
            likeCount,
            commentCount,
            engagementCount: likeCount + commentCount,
          },
        };
      }

      case 'fan_activity':
        return {
          ...item,
          data: {
            ...item.data,
            likeCount: item.data.likeCount ?? 0,
            commentCount: item.data.commentCount ?? 0,
            engagementCount: item.data.engagementCount ?? 0,
          },
        };

      default:
        return item;
    }
  });
}
