import type { LinkPreview } from './news';

export type DiscussionMediaType = 'image' | 'video';
export type DiscussionReportReason = 'spam' | 'abuse' | 'harassment' | 'personal_info' | 'other';
export type DiscussionModerationStatus = 'timed_out' | 'blocked';

export type DiscussionAuthor = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type DiscussionThread = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  isPinned: boolean;
  isLocked: boolean;
  replyCount: number;
  lastPostAt?: string | null;
  createdAt: string;
};

export type DiscussionPostMedia = {
  id: string;
  postId: string;
  type: DiscussionMediaType;
  url: string;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  sortOrder: number;
};

export type DiscussionPost = {
  id: string;
  threadId: string;
  parentPostId?: string | null;
  authorId: string;
  author: DiscussionAuthor;
  body: string;
  createdAt: string;
  updatedAt: string;
  editedAt?: string | null;
  hiddenAt?: string | null;
  deletedAt?: string | null;
  media: DiscussionPostMedia[];
  linkPreview?: (LinkPreview & { id?: string }) | null;
  reactionCount: number;
  likedByMe: boolean;
  replies: DiscussionPost[];
};

export type DiscussionReport = {
  id: string;
  postId: string;
  reason: DiscussionReportReason;
  details?: string | null;
  status: 'open' | 'reviewed' | 'dismissed' | 'actioned';
  createdAt: string;
  post?: DiscussionPost | null;
};

export type DiscussionUserModeration = {
  id: string;
  userId: string;
  status: DiscussionModerationStatus;
  reason?: string | null;
  startsAt: string;
  expiresAt?: string | null;
};
