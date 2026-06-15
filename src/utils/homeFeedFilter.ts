import type { FeedItem } from '../types/feed';
import { normalizePostType, type PostType } from '../types/post';

export type HomeFeedFilter = 'all' | 'fan_posts' | 'media_articles';

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getPostTypeForFilter(filter: Exclude<HomeFeedFilter, 'all'>): PostType {
  return filter === 'media_articles' ? 'media_article' : 'post';
}

export function filterHomeFeedItems(items: FeedItem[], filter: HomeFeedFilter): FeedItem[] {
  if (filter === 'all') {
    return items;
  }

  const postType = getPostTypeForFilter(filter);

  return items
    .filter(
      (item): item is Extract<FeedItem, { kind: 'post' }> =>
        item.kind === 'post' && normalizePostType(item.data.postType) === postType,
    )
    .sort((left, right) => toTimestamp(right.data.createdAt) - toTimestamp(left.data.createdAt));
}
