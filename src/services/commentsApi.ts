import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { isDemoMode } from '../config/appMode';
import { getDemoCommentById, toggleDemoCommentLike } from '../demo/interactions';

export interface CommentLikeToggleInput {
  commentId: string;
  userId: string;
  willLike: boolean;
}

export interface CommentLikeToggleResult {
  liked: boolean;
}

export interface CommentLikeState {
  likeCount: number;
  likedByMe: boolean;
}

type SupabaseLikeClient = Pick<typeof supabase, 'from' | 'rpc'>;

const COMMENT_LIKE_TARGET_TYPE = 'comment';

export interface CommentReplyRecord {
  id: string;
  created_at: string;
  author_id: string;
  text: string;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
}

export interface AddCommentReplyInput {
  parentId: string;
  targetType: string;
  targetId: string;
  authorId: string;
  text: string;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
}

export async function triggerCommentReplyPush(commentId: string): Promise<boolean> {
  const normalizedCommentId = commentId.trim();
  if (!normalizedCommentId) return false;

  try {
    const { data, error } = await supabase.functions.invoke('push_comment_replies', {
      body: { commentId: normalizedCommentId },
    });

    if (error) {
      logger.warn('[commentsApi] triggerCommentReplyPush failed:', error);
      return false;
    }

    if (data?.ok !== true) {
      logger.warn('[commentsApi] triggerCommentReplyPush returned non-ok payload:', data);
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('[commentsApi] triggerCommentReplyPush threw:', error);
    return false;
  }
}

function normalizeCommentIds(commentIds: string[]): string[] {
  return Array.from(new Set(commentIds.map((id) => id.trim()).filter((id) => id.length > 0)));
}

function createEmptyLikeStateMap(commentIds: string[]): Map<string, CommentLikeState> {
  return new Map(
    commentIds.map((commentId) => [
      commentId,
      {
        likeCount: 0,
        likedByMe: false,
      },
    ]),
  );
}

function getErrorMessage(error: unknown): string {
  return String((error as any)?.message ?? error ?? 'Ukendt fejl');
}

function isDuplicateLikeError(error: unknown): boolean {
  const code = String((error as any)?.code ?? '');
  const message = getErrorMessage(error).toLowerCase();
  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('violates unique constraint')
  );
}

export async function fetchCommentLikeStates(
  commentIds: string[],
  viewerUserId?: string,
): Promise<Map<string, CommentLikeState>> {
  if (isDemoMode) {
    return new Map(
      commentIds.map((commentId) => {
        const comment = getDemoCommentById(commentId);
        return [
          commentId,
          { likeCount: comment?.like_count ?? 0, likedByMe: comment?.liked_by_me ?? false },
        ];
      }),
    );
  }
  return fetchCommentLikeStatesWithClient(supabase, commentIds, viewerUserId);
}

export async function fetchCommentLikeStatesWithClient(
  client: SupabaseLikeClient,
  commentIds: string[],
  viewerUserId?: string,
): Promise<Map<string, CommentLikeState>> {
  const normalizedCommentIds = normalizeCommentIds(commentIds);
  const stateByCommentId = createEmptyLikeStateMap(normalizedCommentIds);

  if (normalizedCommentIds.length === 0) {
    return stateByCommentId;
  }

  const normalizedViewerUserId = viewerUserId?.trim();

  const countsPromise = client.rpc('get_like_state_v2', {
    p_target_type: COMMENT_LIKE_TARGET_TYPE,
    p_target_ids: normalizedCommentIds,
  });

  const viewerLikesPromise = normalizedViewerUserId
    ? client
        .from('likes_v2')
        .select('target_id')
        .eq('user_id', normalizedViewerUserId)
        .eq('target_type', COMMENT_LIKE_TARGET_TYPE)
        .in('target_id', normalizedCommentIds)
    : Promise.resolve({ data: [], error: null });

  const [countsResponse, viewerLikesResponse] = await Promise.all([
    countsPromise,
    viewerLikesPromise,
  ]);

  if (countsResponse.error) {
    logger.warn('[commentsApi] fetchCommentLikeStates count error:', countsResponse.error);
  } else {
    ((countsResponse.data as { target_id: string; likes_count: number | string }[]) || []).forEach(
      (row) => {
        const targetId = String(row.target_id);
        const existing = stateByCommentId.get(targetId);
        if (!existing) return;

        stateByCommentId.set(targetId, {
          ...existing,
          likeCount: Number(row.likes_count) || 0,
        });
      },
    );
  }

  if (viewerLikesResponse.error) {
    logger.warn('[commentsApi] fetchCommentLikeStates viewer error:', viewerLikesResponse.error);
  } else {
    ((viewerLikesResponse.data as { target_id: string }[]) || []).forEach((row) => {
      const targetId = String(row.target_id);
      const existing = stateByCommentId.get(targetId);
      if (!existing) return;

      stateByCommentId.set(targetId, {
        ...existing,
        likedByMe: true,
      });
    });
  }

  return stateByCommentId;
}

export async function toggleCommentLike(
  input: CommentLikeToggleInput,
): Promise<CommentLikeToggleResult> {
  if (isDemoMode) return { liked: toggleDemoCommentLike(input.commentId).liked };
  return toggleCommentLikeWithClient(supabase, input);
}

export async function toggleCommentLikeWithClient(
  client: SupabaseLikeClient,
  input: CommentLikeToggleInput,
): Promise<CommentLikeToggleResult> {
  const commentId = input.commentId.trim();
  const userId = input.userId.trim();

  if (!commentId) {
    throw new Error('Kommentar-id mangler');
  }

  if (!userId) {
    throw new Error('Bruger-id mangler');
  }

  if (input.willLike) {
    const { error } = await client.from('likes_v2').insert({
      user_id: userId,
      target_type: COMMENT_LIKE_TARGET_TYPE,
      target_id: commentId,
    });

    if (error) {
      if (isDuplicateLikeError(error)) {
        return { liked: true };
      }

      logger.warn('[commentsApi] toggleCommentLike insert error:', error);
      throw new Error('Kunne ikke like kommentaren');
    }

    return { liked: true };
  }

  const { error } = await client.from('likes_v2').delete().match({
    user_id: userId,
    target_type: COMMENT_LIKE_TARGET_TYPE,
    target_id: commentId,
  });

  if (error) {
    logger.warn('[commentsApi] toggleCommentLike delete error:', error);
    throw new Error('Kunne ikke fjerne like fra kommentaren');
  }

  return { liked: false };
}

// TODO: Replace stub with real API call once backend supports replies.
export async function addCommentReply(input: AddCommentReplyInput): Promise<CommentReplyRecord> {
  if (__DEV__) {
    logger.warn('[commentsApi] TODO: addCommentReply not wired', {
      parentId: input.parentId,
      targetType: input.targetType,
      targetId: input.targetId,
    });
  }

  return {
    id: `local-${Date.now()}`,
    created_at: new Date().toISOString(),
    author_id: input.authorId,
    text: input.text,
    author_display_name: input.authorDisplayName ?? null,
    author_avatar_url: input.authorAvatarUrl ?? null,
  };
}

/**
 * Fetch unique post IDs that a user has commented on, ordered by most recent comment.
 * Only considers target_type = 'post' and excludes the user's own posts (filtered downstream).
 */
export async function fetchUserCommentedPostIds(userId: string, limit = 25): Promise<string[]> {
  try {
    // Fetch the user's comments on posts, newest first
    const { data, error } = await supabase
      .from('comments_v2')
      .select('target_id, created_at')
      .eq('author_id', userId)
      .eq('target_type', 'post')
      .order('created_at', { ascending: false })
      .limit(200); // over-fetch to account for duplicates

    if (error) {
      if (__DEV__) logger.warn('[commentsApi] fetchUserCommentedPostIds error:', error);
      return [];
    }

    // Deduplicate while preserving order (newest first)
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const row of data || []) {
      if (!seen.has(row.target_id)) {
        seen.add(row.target_id);
        unique.push(row.target_id);
      }
      if (unique.length >= limit) break;
    }
    return unique;
  } catch {
    return [];
  }
}
