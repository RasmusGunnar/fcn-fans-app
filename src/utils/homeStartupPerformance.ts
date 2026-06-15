import type { FeedItem } from '../types/feed';
import { getPrimaryMediaKind } from './postMediaMapping';

export type FeedVisibleMediaKind = 'article-preview' | 'image' | 'video';

export function getFeedItemVisibleMediaKind(
  item: FeedItem,
): FeedVisibleMediaKind | null {
  if (item.kind === 'post') {
    if (item.data.postType === 'media_article') {
      return item.data.linkPreview ? 'article-preview' : null;
    }

    const mediaKind = getPrimaryMediaKind(item.data.media);
    return mediaKind === 'image' || mediaKind === 'video' ? mediaKind : null;
  }

  if (item.kind === 'news' && item.data.imageUrl) {
    return 'image';
  }

  return null;
}

export function buildHomeStartupMediaAudit(
  items: FeedItem[],
  initialRenderCount = 5,
): {
  initialItemCount: number;
  initialMediaItemCount: number;
  initialVideoCount: number;
  initialMediaArticleCount: number;
  eagerFaviconRequestCount: 0;
  eagerMediaPrefetchCount: 0;
  inlinePlayerMountCount: 0;
} {
  const initialItems = items.slice(0, initialRenderCount);
  const mediaKinds = initialItems.map(getFeedItemVisibleMediaKind);

  return {
    initialItemCount: initialItems.length,
    initialMediaItemCount: mediaKinds.filter(Boolean).length,
    initialVideoCount: mediaKinds.filter((kind) => kind === 'video').length,
    initialMediaArticleCount: initialItems.filter(
      (item) => item.kind === 'post' && item.data.postType === 'media_article',
    ).length,
    eagerFaviconRequestCount: 0,
    eagerMediaPrefetchCount: 0,
    inlinePlayerMountCount: 0,
  };
}
