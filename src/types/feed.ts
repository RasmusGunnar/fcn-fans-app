/**
 * Unified feed item types for the home screen feed
 */

import { Post } from './post';
import { NewsItem } from './news';
import { targetKey } from '../utils/targetKey';

/**
 * Union type for all feed items
 * Each item has a discriminator 'kind' and a unique 'id'
 */
export type FeedItem =
  | { kind: 'post'; id: string; data: Post }
  | { kind: 'news'; id: string; data: NewsItem };

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
