import type { PickedMedia } from '../lib/mediaPicker';
import { DISCUSSION_MEDIA_BUCKET, uploadDiscussionMedia } from '../lib/discussionMedia';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import type {
  DiscussionPost,
  DiscussionPostMedia,
  DiscussionReport,
  DiscussionReportReason,
  DiscussionThread,
  DiscussionUserModeration,
} from '../types/discussion';
import type { LinkPreview } from '../types/news';
import { extractPrimaryUrl, groupDiscussionReplies } from '../utils/discussion';

const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;
const DEFAULT_POST_LIMIT = 50;

type ProfileRow = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

function mapThread(row: any): DiscussionThread {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    isPinned: Boolean(row.is_pinned),
    isLocked: Boolean(row.is_locked),
    replyCount: Number(row.reply_count ?? 0),
    unreadCount: Number(row.unread_count ?? 0),
    lastPostAt: row.last_post_at,
    createdAt: row.created_at,
  };
}

function mapProfile(row: ProfileRow | undefined, userId: string) {
  const displayName = row?.display_name?.trim() || 'FCN fan';
  return {
    id: userId,
    displayName,
    avatarUrl: row?.avatar_url ?? null,
  };
}

function mapLinkPreview(row: any): (LinkPreview & { id: string }) | null {
  if (!row) {
    return null;
  }

  const resolvedUrl = row.resolved_url || row.url;
  const domain = row.domain || new URL(resolvedUrl).hostname.replace(/^www\./i, '');

  return {
    id: row.id,
    url: resolvedUrl,
    title: row.title || domain || resolvedUrl,
    description: row.description || undefined,
    imageUrl: row.image_url || undefined,
    siteName: domain || undefined,
  };
}

async function signDiscussionMedia(path?: string | null): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(DISCUSSION_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) {
    logger.warn('[discussionsApi] Failed to create signed URL', {
      path,
      message: error.message,
    });
    return null;
  }

  return data.signedUrl;
}

async function hydrateMedia(postIds: string[]): Promise<Map<string, DiscussionPostMedia[]>> {
  const mediaByPost = new Map<string, DiscussionPostMedia[]>();
  if (postIds.length === 0) return mediaByPost;

  const { data, error } = await supabase
    .from('discussion_post_media')
    .select('*')
    .in('post_id', postIds)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    const url = await signDiscussionMedia(row.storage_path);
    if (!url) continue;

    const thumbnailUrl = await signDiscussionMedia(row.thumbnail_path);
    const item: DiscussionPostMedia = {
      id: row.id,
      postId: row.post_id,
      type: row.media_type,
      url,
      thumbnailUrl,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
      sortOrder: row.sort_order,
    };

    mediaByPost.set(row.post_id, [...(mediaByPost.get(row.post_id) ?? []), item]);
  }

  return mediaByPost;
}

async function hydrateProfiles(authorIds: string[]): Promise<Map<string, ProfileRow>> {
  const profiles = new Map<string, ProfileRow>();
  if (authorIds.length === 0) return profiles;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', Array.from(new Set(authorIds)));

  if (error) {
    logger.warn('[discussionsApi] Profile hydration failed', {
      code: error.code,
      message: error.message,
    });
    return profiles;
  }

  for (const row of data ?? []) {
    profiles.set(row.id, row as ProfileRow);
  }

  return profiles;
}

async function hydrateLinkPreviews(
  previewIds: string[],
): Promise<Map<string, LinkPreview & { id: string }>> {
  const previews = new Map<string, LinkPreview & { id: string }>();
  if (previewIds.length === 0) return previews;

  const { data, error } = await supabase
    .from('discussion_link_previews')
    .select('*')
    .in('id', Array.from(new Set(previewIds)));

  if (error) {
    logger.warn('[discussionsApi] Link preview hydration failed', {
      code: error.code,
      message: error.message,
    });
    return previews;
  }

  for (const row of data ?? []) {
    const preview = mapLinkPreview(row);
    if (preview?.id) {
      previews.set(preview.id, preview);
    }
  }

  return previews;
}

async function hydrateReactions(
  postIds: string[],
  userId?: string | null,
): Promise<{ counts: Map<string, number>; likedByMe: Set<string> }> {
  const counts = new Map<string, number>();
  const likedByMe = new Set<string>();
  if (postIds.length === 0) return { counts, likedByMe };

  const { data, error } = await supabase
    .from('discussion_reactions')
    .select('post_id, user_id')
    .in('post_id', postIds);

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
    if (userId && row.user_id === userId) {
      likedByMe.add(row.post_id);
    }
  }

  return { counts, likedByMe };
}

export async function fetchDiscussionThreads(): Promise<DiscussionThread[]> {
  const rpcResponse = await supabase.rpc('get_discussion_threads_with_unread');
  if (!rpcResponse.error) {
    return (rpcResponse.data ?? []).map(mapThread);
  }

  const isMissingUnreadRpc =
    rpcResponse.error.code === '42883' ||
    rpcResponse.error.code === 'PGRST202' ||
    rpcResponse.error.message?.includes('get_discussion_threads_with_unread');
  if (!isMissingUnreadRpc) {
    throw rpcResponse.error;
  }

  const { data, error } = await supabase
    .from('discussion_threads')
    .select(
      'id, slug, title, description, is_pinned, is_locked, reply_count, last_post_at, created_at',
    )
    .order('is_pinned', { ascending: false })
    .order('last_post_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapThread);
}

export async function markDiscussionThreadRead(params: {
  threadId: string;
  lastSeenPostId: string;
}): Promise<void> {
  const { error } = await supabase.rpc('mark_discussion_thread_read', {
    p_thread_id: params.threadId,
    p_last_seen_post_id: params.lastSeenPostId,
  });

  if (!error) return;

  const isMissingReadRpc =
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.message?.includes('mark_discussion_thread_read');
  if (isMissingReadRpc) {
    logger.warn('[discussionsApi] Read-state RPC is not deployed yet.');
    return;
  }

  throw error;
}

export async function fetchDiscussionPosts(params: {
  threadId: string;
  userId?: string | null;
  before?: string | null;
  limit?: number;
}): Promise<DiscussionPost[]> {
  let query = supabase
    .from('discussion_posts')
    .select('*')
    .eq('thread_id', params.threadId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? DEFAULT_POST_LIMIT);

  if (params.before) {
    query = query.lt('created_at', params.before);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rows = [...(data ?? [])].reverse();
  const postIds = rows.map((row) => row.id);
  const authorIds = rows.map((row) => row.author_id);
  const previewIds = rows
    .map((row) => row.link_preview_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const [profiles, mediaByPost, previews, reactions] = await Promise.all([
    hydrateProfiles(authorIds),
    hydrateMedia(postIds),
    hydrateLinkPreviews(previewIds),
    hydrateReactions(postIds, params.userId),
  ]);

  const posts: DiscussionPost[] = rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    parentPostId: row.parent_post_id,
    authorId: row.author_id,
    author: mapProfile(profiles.get(row.author_id), row.author_id),
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    hiddenAt: row.hidden_at,
    deletedAt: row.deleted_at,
    media: mediaByPost.get(row.id) ?? [],
    linkPreview: row.link_preview_id ? (previews.get(row.link_preview_id) ?? null) : null,
    reactionCount: reactions.counts.get(row.id) ?? 0,
    likedByMe: reactions.likedByMe.has(row.id),
    replies: [],
  }));

  return groupDiscussionReplies(posts);
}

export async function fetchActiveDiscussionModeration(
  userId: string,
): Promise<DiscussionUserModeration | null> {
  const { data, error } = await supabase
    .from('discussion_user_moderation')
    .select('*')
    .eq('user_id', userId)
    .lte('starts_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.warn('[discussionsApi] Moderation lookup failed', {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  const active = (data ?? []).find(
    (row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now(),
  );

  if (!active) return null;

  return {
    id: active.id,
    userId: active.user_id,
    status: active.status,
    reason: active.reason,
    startsAt: active.starts_at,
    expiresAt: active.expires_at,
  };
}

async function fetchDiscussionLinkPreviewId(body: string): Promise<string | null> {
  const url = extractPrimaryUrl(body);
  if (!url) return null;

  try {
    const { data, error } = await supabase.functions.invoke('discussion-link-preview', {
      body: { url },
    });

    if (error) {
      logger.warn('[discussionsApi] discussion-link-preview failed', {
        message: error.message,
      });
      return null;
    }

    return typeof data?.id === 'string' ? data.id : null;
  } catch (error) {
    logger.warn('[discussionsApi] discussion-link-preview threw', error);
    return null;
  }
}

export async function createDiscussionPost(params: {
  threadId: string;
  parentPostId?: string | null;
  body: string;
  userId: string;
  media?: PickedMedia[];
}): Promise<string> {
  const body = params.body.trim();
  if (!body) {
    throw new Error('Skriv en besked først.');
  }

  const linkPreviewId = await fetchDiscussionLinkPreviewId(body);

  const { data: post, error } = await supabase
    .from('discussion_posts')
    .insert({
      thread_id: params.threadId,
      parent_post_id: params.parentPostId ?? null,
      author_id: params.userId,
      body,
      link_preview_id: linkPreviewId,
    })
    .select('id')
    .single();

  if (error || !post) {
    throw error ?? new Error('Indlægget kunne ikke oprettes.');
  }

  const media = params.media ?? [];
  if (media.length === 0) {
    return post.id;
  }

  try {
    const uploaded = await Promise.all(
      media.map((asset) => uploadDiscussionMedia(params.userId, post.id, asset)),
    );

    const rows = uploaded.map((item, index) => ({
      post_id: post.id,
      author_id: params.userId,
      bucket: item.bucket,
      storage_path: item.path,
      thumbnail_path: item.thumbnailPath,
      media_type: item.type,
      mime_type: item.mimeType,
      width: item.width,
      height: item.height,
      duration_ms: item.durationMs,
      size_bytes: item.sizeBytes,
      sort_order: index,
    }));

    const { error: mediaError } = await supabase.from('discussion_post_media').insert(rows);
    if (mediaError) {
      throw mediaError;
    }
  } catch (mediaError) {
    logger.error('[discussionsApi] Media upload failed after post insert', mediaError);
    await softDeleteDiscussionPost(post.id, params.userId).catch(() => undefined);
    throw new Error('Mediet kunne ikke uploades. Indlægget blev ikke gemt.');
  }

  return post.id;
}

export async function updateDiscussionPost(params: {
  postId: string;
  body: string;
}): Promise<void> {
  const body = params.body.trim();
  if (!body) {
    throw new Error('Beskeden må ikke være tom.');
  }

  const linkPreviewId = await fetchDiscussionLinkPreviewId(body);
  const { error } = await supabase
    .from('discussion_posts')
    .update({
      body,
      link_preview_id: linkPreviewId,
    })
    .eq('id', params.postId);

  if (error) {
    throw error;
  }
}

export async function softDeleteDiscussionPost(postId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('discussion_posts')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq('id', postId);

  if (error) {
    throw error;
  }
}

export async function toggleDiscussionReaction(params: {
  postId: string;
  userId: string;
  liked: boolean;
}): Promise<boolean> {
  if (params.liked) {
    const { error } = await supabase
      .from('discussion_reactions')
      .delete()
      .eq('post_id', params.postId)
      .eq('user_id', params.userId)
      .eq('reaction_type', 'like');

    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from('discussion_reactions').insert({
    post_id: params.postId,
    user_id: params.userId,
    reaction_type: 'like',
  });

  if (error) {
    if (error.code === '23505') {
      return true;
    }
    throw error;
  }
  return true;
}

export async function reportDiscussionPost(params: {
  postId: string;
  userId: string;
  reason: DiscussionReportReason;
  details?: string;
}): Promise<void> {
  const { error } = await supabase.from('discussion_reports').insert({
    post_id: params.postId,
    reporter_user_id: params.userId,
    reason: params.reason,
    details: params.details?.trim() || null,
  });

  if (error) {
    throw error;
  }
}

export async function hideDiscussionPost(params: {
  postId: string;
  adminUserId: string;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('discussion_posts')
    .update({
      hidden_at: new Date().toISOString(),
      hidden_by: params.adminUserId,
      moderation_reason: params.reason?.trim() || null,
    })
    .eq('id', params.postId);

  if (error) throw error;
}

export async function showDiscussionPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('discussion_posts')
    .update({
      hidden_at: null,
      hidden_by: null,
      moderation_reason: null,
    })
    .eq('id', postId);

  if (error) throw error;
}

export async function setDiscussionThreadLocked(params: {
  threadId: string;
  locked: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('discussion_threads')
    .update({
      is_locked: params.locked,
      locked_at: params.locked ? new Date().toISOString() : null,
    })
    .eq('id', params.threadId);

  if (error) throw error;
}

export async function setDiscussionThreadPinned(params: {
  threadId: string;
  pinned: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('discussion_threads')
    .update({
      is_pinned: params.pinned,
      pinned_at: params.pinned ? new Date().toISOString() : null,
    })
    .eq('id', params.threadId);

  if (error) throw error;
}

export async function timeoutDiscussionUser(params: {
  userId: string;
  adminUserId: string;
  reason?: string;
  expiresAt?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('discussion_user_moderation').insert({
    user_id: params.userId,
    status: params.expiresAt ? 'timed_out' : 'blocked',
    reason: params.reason?.trim() || null,
    expires_at: params.expiresAt ?? null,
    created_by: params.adminUserId,
  });

  if (error) throw error;
}

export async function fetchOpenDiscussionReports(): Promise<DiscussionReport[]> {
  const { data, error } = await supabase
    .from('discussion_reports')
    .select('id, post_id, reason, details, status, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    postId: row.post_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
  }));
}
