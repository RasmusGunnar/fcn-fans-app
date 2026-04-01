/**
 * Unified feed item types for the home screen feed
 */

import type { FanLevelKey } from './fan';
import { NewsItem } from './news';
import { Post } from './post';

export type FeedRankingSignals = {
  sortDate?: string | null;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  expiresAt?: string | null;
  isActivePoll?: boolean;
  isSystemCard?: boolean;
  likeCount?: number | null;
  commentCount?: number | null;
  engagementCount?: number | null;
};

export type FeedPostData = Post & FeedRankingSignals;

export type FeedNewsData = NewsItem & FeedRankingSignals;

export type FeedEventData = {
  id: string;
  title: string;
  startAt?: string | null;
  location?: string | null;
  description?: string | null;
  organizerName?: string | null;
  organizerGroupId?: string | null;
  organizerType?: 'fan' | 'community' | string | null;
  organizerId?: string | null;
  creatorUserId?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  eventType?: 'event' | 'bus_trip' | string | null;
  coverBucket?: string | null;
  coverPath?: string | null;
} & FeedRankingSignals;

export type FeedBusTripData = {
  id: string;
  title: string;
  startAt?: string | null;
  location?: string | null;
  description?: string | null;
  organizerName?: string | null;
  organizerGroupId?: string | null;
  organizerType?: 'fan' | 'community' | string | null;
  organizerId?: string | null;
  createdAt?: string | null;
  eventType?: 'bus_trip' | string | null;
} & FeedRankingSignals;

export type FeedMatchData = {
  id: string;
  kickoffAt?: string | null;
  home?: string | null;
  away?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  venue?: string | null;
  venueCity?: string | null;
  competition?: string | null;
  round?: string | null;
  homeTeamProviderId?: string | null;
  heroUrl?: string | null;
} & FeedRankingSignals;

export type FeedCommunityData = {
  id: string;
  communityId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  creatorId?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  debugSource?: 'local' | 'persisted' | 'local+persisted' | null;
} & FeedRankingSignals;

export type FeedFanActivityData = {
  id: string;
  parentType: 'match' | 'event';
  parentId: string;
  parentIsUpcoming?: boolean;
  type: string;
  title: string;
  body?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  communityId?: string | null;
  communityName?: string | null;
  coverUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  createdAt?: string | null;
} & FeedRankingSignals;

export type WeeklyTopFanReasonType = 'post' | 'comment' | 'activity' | 'checkin';

export type FeedWeeklyTopFanData = {
  id: string;
  weekStartDate: string;
  generatedAt?: string | null;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  fanLevelKey: FanLevelKey;
  weeklyScore: number;
  reasonType: WeeklyTopFanReasonType;
  referencePostId?: string | null;
  referenceCommentId?: string | null;
  title: string;
  subtitle: string;
  body: string;
  ctaLabel: string;
  isPublished: boolean;
  createdAt: string;
  contentTypeLabel?: string | null;
  highlightText?: string | null;
  likesCount?: number | null;
  commentsCount?: number | null;
  votesCount?: number | null;
} & FeedRankingSignals;

/**
 * Union type for all feed items
 * Each item has a discriminator 'kind' and a unique 'id'
 */
export type FeedItem =
  | { kind: 'post'; id: string; data: FeedPostData }
  | { kind: 'news'; id: string; data: FeedNewsData }
  | { kind: 'event'; id: string; data: FeedEventData }
  | { kind: 'bus_trip'; id: string; data: FeedBusTripData }
  | { kind: 'match'; id: string; data: FeedMatchData }
  | { kind: 'community'; id: string; data: FeedCommunityData }
  | { kind: 'fan_activity'; id: string; data: FeedFanActivityData }
  | { kind: 'weekly_top_fan'; id: string; data: FeedWeeklyTopFanData };

/**
 * Type guard functions
 */
export function isPostItem(item: FeedItem): item is { kind: 'post'; id: string; data: FeedPostData } {
  return item.kind === 'post';
}

export function isNewsItem(item: FeedItem): item is { kind: 'news'; id: string; data: FeedNewsData } {
  return item.kind === 'news';
}

/**
 * Helper to create feed item key for likes/state management
 */
export function getFeedItemKey(item: FeedItem): string {
  return `${item.kind}:${item.id}`;
}
