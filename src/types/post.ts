import type { LinkPreview } from './news';

export type PostType = 'post' | 'media_article';

export function normalizePostType(value: unknown): PostType {
  return value === 'media_article' ? 'media_article' : 'post';
}

export function hasValidPostSubtypePayload(postType: PostType, linkPreview: unknown): boolean {
  if (postType !== 'media_article') {
    return true;
  }

  if (!linkPreview || typeof linkPreview !== 'object' || Array.isArray(linkPreview)) {
    return false;
  }

  const url = (linkPreview as Record<string, unknown>).url;
  if (typeof url !== 'string' || !url.trim()) {
    return false;
  }

  try {
    const parsedUrl = new URL(url.trim());
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export function assertValidPostSubtypePayload(postType: PostType, linkPreview: unknown): void {
  if (!hasValidPostSubtypePayload(postType, linkPreview)) {
    throw new TypeError('media_article requires a valid HTTP(S) link_preview.url');
  }
}

export interface PollOption {
  id: string;
  text: string;
}

export interface PollData {
  question: string;
  options: PollOption[];
  duration: number;
  expires_at: string;
}

export interface Post {
  id: string;
  postType: PostType;
  authorName: string;
  authorId?: string;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
  authorFanLevelKey?: import('./fan').FanLevelKey | null;
  actorType?: 'user' | 'community';
  actorId?: string;
  actorDisplayName?: string | null;
  actorAvatarUrl?: string | null;
  authorAvatarColor?: string;
  communityName?: string;
  factionName?: string;
  communityId?: string | null;
  feedTargets?: string[];
  createdAt: string;
  text: string;
  poll_data?: PollData | null;
  linkPreview?: LinkPreview | null;
  imageUri?: string;
  media?: {
    demoVideoPreview?: boolean;
    bucket?: string;
    path?: string;
    thumbnail_bucket?: string;
    thumbnail_path?: string;
    // Legacy fields
    url?: string;
    publicUrl?: string;
    type?: 'image' | 'video';
    mimeType?: string;
    width?: number;
    height?: number;
    duration?: number;
    metadata?: {
      width?: number;
      height?: number;
    };
  }[];
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
}
