import type { FeedItem } from '../types/feed';
import type { Post } from '../types/post';

function toIsoOrNull(value?: string | null): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
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
