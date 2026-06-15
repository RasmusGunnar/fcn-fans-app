import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { fetchCommentCounts, fetchCommentPreviews, fetchLikeStates, fetchMyLikedIds, type CommentPreview } from './likesApi';
import type { FanLevelKey } from '../types/fan';
import { normalizePostType, type Post } from '../types/post';
import { resolveAvatarUrl } from '../utils/avatar';
import { normalizeLinkPreview } from '../utils/linkPreview';
import { normalizeMedia } from '../utils/media';
import { POST_ENGAGEMENT_TARGET_TYPE } from '../utils/postEngagement';

type PostAuthorProfile = {
  display_name: string | null;
  username?: string | null;
  avatar_url: string | null;
  fan_level_key?: FanLevelKey | null;
};

type PostDetailEngagement = {
  liked: boolean;
  likes: number;
  commentsCount: number;
  commentPreviews: CommentPreview[];
};

export type PostDetailResult = {
  post: Post;
  authorProfile: PostAuthorProfile | null;
  engagement: PostDetailEngagement;
};

type PostRow = {
  id: string;
  created_at: string;
  author_id: string;
  actor_type: string | null;
  actor_id: string | null;
  text: string | null;
  media: unknown;
  community_id: string | null;
  feed_targets: unknown;
  poll_data: Post['poll_data'];
  link_preview: unknown;
  post_type: unknown;
};

const PROFILE_SELECT_ATTEMPTS = [
  'id, display_name, username, avatar_url, fan_level_key',
  'id, display_name, username, avatar_url',
  'id, display_name, avatar_url, fan_level_key',
  'id, display_name, avatar_url',
] as const;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

async function fetchProfileById(userId: string): Promise<PostAuthorProfile | null> {
  for (const select of PROFILE_SELECT_ATTEMPTS) {
    const { data, error } = await supabase.from('profiles').select(select).eq('id', userId).maybeSingle();

    if (error) {
      logger.warn('[postsApi] profile lookup failed for select', { select, error });
      continue;
    }

    if (!data) {
      return null;
    }

    const profile = data as unknown as Record<string, unknown>;

    return {
      display_name: readString(profile.display_name),
      username: 'username' in profile ? readString(profile.username) : null,
      avatar_url: readString(profile.avatar_url),
      fan_level_key: ('fan_level_key' in profile ? readString(profile.fan_level_key) : null) as FanLevelKey | null,
    };
  }

  return null;
}

async function fetchCommunityIdentity(communityId: string | null): Promise<{
  name: string | null;
  avatarUrl: string | null;
}> {
  if (!communityId) {
    return { name: null, avatarUrl: null };
  }

  const { data, error } = await supabase
    .from('communities')
    .select('id, name, avatar_url, avatar_path')
    .eq('id', communityId)
    .maybeSingle();

  if (error) {
    logger.warn('[postsApi] community lookup failed', { communityId, error });
    return { name: null, avatarUrl: null };
  }

  return {
    name: readString(data?.name) ?? null,
    avatarUrl: resolveAvatarUrl(readString(data?.avatar_url ?? data?.avatar_path) ?? null),
  };
}

export async function fetchPostDetailById(
  postId: string,
  currentUserId?: string | null,
): Promise<PostDetailResult | null> {
  const normalizedPostId = readString(postId);
  if (!normalizedPostId) {
    return null;
  }

  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets, poll_data, link_preview, post_type',
    )
    .eq('id', normalizedPostId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as PostRow | null) ?? null;
  if (!row) {
    return null;
  }

  const authorProfilePromise = fetchProfileById(row.author_id);
  const communityIdentityId =
    readString(row.actor_type) === 'community'
      ? readString(row.actor_id) ?? readString(row.community_id)
      : readString(row.community_id);

  const [authorProfile, communityIdentity, likeStateMap, commentCountMap, commentPreviewMap, likedIds] =
    await Promise.all([
      authorProfilePromise,
      fetchCommunityIdentity(communityIdentityId),
      fetchLikeStates(POST_ENGAGEMENT_TARGET_TYPE, [normalizedPostId]),
      fetchCommentCounts(POST_ENGAGEMENT_TARGET_TYPE, [normalizedPostId]),
      fetchCommentPreviews(POST_ENGAGEMENT_TARGET_TYPE, [normalizedPostId]),
      currentUserId
        ? fetchMyLikedIds(currentUserId, POST_ENGAGEMENT_TARGET_TYPE, [normalizedPostId])
        : Promise.resolve(new Set<string>()),
    ]);

  const displayName = authorProfile?.display_name?.trim() || 'Fan';
  const actorType = readString(row.actor_type) === 'community' ? 'community' : 'user';
  const actorId = readString(row.actor_id) ?? row.author_id;
  const feedTargets = readStringArray(row.feed_targets);
  const likeState = likeStateMap.get(normalizedPostId) ?? { liked: false, likes: 0 };
  const commentsCount = commentCountMap.get(normalizedPostId) ?? 0;
  const commentPreviews = commentPreviewMap.get(normalizedPostId) ?? [];
  const likedByMe = currentUserId ? likedIds.has(normalizedPostId) : likeState.liked;

  const post: Post = {
    id: row.id,
    postType: normalizePostType(row.post_type),
    authorName: displayName,
    authorId: row.author_id,
    authorDisplayName: authorProfile?.display_name ?? null,
    authorAvatarUrl: authorProfile?.avatar_url ?? null,
    authorFanLevelKey: authorProfile?.fan_level_key ?? null,
    actorType,
    actorId,
    actorDisplayName: actorType === 'community' ? communityIdentity.name : authorProfile?.display_name ?? displayName,
    actorAvatarUrl: actorType === 'community' ? communityIdentity.avatarUrl : null,
    communityName: communityIdentity.name ?? undefined,
    communityId: readString(row.community_id),
    feedTargets: feedTargets.length > 0 ? feedTargets : ['home'],
    createdAt: row.created_at,
    text: row.text ?? '',
    poll_data: row.poll_data ?? null,
    linkPreview: normalizeLinkPreview(row.link_preview),
    media: normalizeMedia(row.media),
    likesCount: likeState.likes,
    commentsCount,
    likedByMe,
  };

  return {
    post,
    authorProfile,
    engagement: {
      liked: likedByMe,
      likes: likeState.likes,
      commentsCount,
      commentPreviews,
    },
  };
}
