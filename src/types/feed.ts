/**
 * Unified feed item types for the home screen feed
 */

import { Post } from './post';
import { NewsItem } from './news';
import { targetKey } from '../utils/targetKey';

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
};

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
};

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
};

/**
 * Union type for all feed items
 * Each item has a discriminator 'kind' and a unique 'id'
 */
export type FeedItem =
  | { kind: 'post'; id: string; data: Post }
  | { kind: 'news'; id: string; data: NewsItem }
  | { kind: 'event'; id: string; data: FeedEventData }
  | { kind: 'bus_trip'; id: string; data: FeedBusTripData }
  | { kind: 'match'; id: string; data: FeedMatchData };

/**
 * Type guard functions
 */
export function isPostItem(item: FeedItem): item is { kind: 'post'; id: string; data: Post } {
  return item.kind === 'post';
}

export function isNewsItem(item: FeedItem): item is { kind: 'news'; id: string; data: NewsItem } {
  return item.kind === 'news';
}

/**
 * Helper to create feed item key for likes/state management
 */
export function getFeedItemKey(item: FeedItem): string {
  return targetKey(item.kind, item.id);
}
