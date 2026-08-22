import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { isDemoMode } from '../config/appMode';
import { getDemoComments, getDemoLikeState, toggleDemoLike } from '../demo/interactions';
import { DEMO_ENGAGEMENT, getDemoCommentPreviews } from '../demo/posts';

export type LikeTargetType = 'post' | 'news' | 'event' | 'match' | 'bus_trip';

interface LikeState {
  target_id: string;
  likes_count: number;
  liked: boolean;
}

interface CommentMeta {
  target_id: string;
  comments_count: number;
}

/**
 * Fetch like states for multiple targets of the same type
 */
export async function fetchLikeStates(
  targetType: LikeTargetType,
  targetIds: string[],
): Promise<Map<string, { liked: boolean; likes: number }>> {
  if (isDemoMode) {
    return new Map(targetIds.map((id) => [id, getDemoLikeState(targetType, id)]));
  }
  if (targetIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.rpc('get_like_state_v2', {
    p_target_type: targetType,
    p_target_ids: targetIds,
  });

  if (error) {
    if (__DEV__) {
      logger.warn('[fetchLikeStates] RPC error:', error);
    }
    return new Map();
  }

  const resultMap = new Map<string, { liked: boolean; likes: number }>();

  ((data as LikeState[]) || []).forEach((item) => {
    resultMap.set(item.target_id, {
      liked: item.liked,
      likes: item.likes_count,
    });
  });

  return resultMap;
}

/**
 * Fetch comment counts for multiple targets of the same type
 */
export async function fetchCommentCounts(
  targetType: LikeTargetType,
  targetIds: string[],
): Promise<Map<string, number>> {
  if (isDemoMode) {
    return new Map(
      targetIds.map((id) => [
        id,
        DEMO_ENGAGEMENT[`${targetType}:${id}`]?.comments ?? getDemoComments(targetType, id).length,
      ]),
    );
  }
  if (targetIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.rpc('get_comment_meta_v2', {
    p_target_type: targetType,
    p_target_ids: targetIds,
  });

  if (error) {
    if (__DEV__) {
      logger.warn('[fetchCommentCounts] RPC error:', error);
    }
    return new Map();
  }

  const resultMap = new Map<string, number>();

  ((data as CommentMeta[]) || []).forEach((item) => {
    resultMap.set(item.target_id, item.comments_count);
  });

  return resultMap;
}

export interface CommentPreview {
  id: string;
  author_id: string;
  text: string;
  created_at: string;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  replies?: CommentPreview[];
}

/**
 * Fetch preview of latest 2 comments for multiple targets
 * Returns map of targetId -> array of up to 2 comments (newest first)
 */
export async function fetchCommentPreviews(
  targetType: LikeTargetType,
  targetIds: string[],
): Promise<Map<string, CommentPreview[]>> {
  if (isDemoMode) {
    return new Map(targetIds.map((id) => [id, getDemoCommentPreviews(targetType, id)]));
  }
  if (targetIds.length === 0) {
    return new Map();
  }

  const resultMap = new Map<string, CommentPreview[]>();

  try {
    const commentsByTarget = new Map<
      string,
      { id: string; author_id: string; text: string; created_at: string }[]
    >();

    // Keep the existing per-target limit semantics, but hydrate all authors in one query.
    await Promise.all(
      targetIds.map(async (targetId) => {
        const { data, error } = await supabase
          .from('comments_v2')
          .select('id, author_id, text, created_at')
          .eq('target_type', targetType)
          .eq('target_id', targetId)
          .order('created_at', { ascending: false })
          .limit(2);

        if (error) {
          if (__DEV__) {
            logger.warn(`[fetchCommentPreviews] Error for ${targetId}:`, error);
          }
          commentsByTarget.set(targetId, []);
          return;
        }

        commentsByTarget.set(targetId, data || []);
      }),
    );

    const authorIds = [
      ...new Set(
        Array.from(commentsByTarget.values())
          .flat()
          .map((comment) => comment.author_id)
          .filter(Boolean),
      ),
    ];
    const profileMap = new Map<
      string,
      { display_name: string | null; avatar_url: string | null }
    >();

    if (authorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', authorIds);

      if (profilesError) {
        if (__DEV__) {
          logger.warn('[fetchCommentPreviews] Batched profile fetch failed:', profilesError);
        }
      } else {
        (profiles || []).forEach((profile) => {
          profileMap.set(profile.id, {
            display_name: profile.display_name ?? null,
            avatar_url: profile.avatar_url ?? null,
          });
        });
      }
    }

    targetIds.forEach((targetId) => {
      const commentsWithAuthors = (commentsByTarget.get(targetId) || []).map((comment) => {
        const profile = profileMap.get(comment.author_id);
        return {
          ...comment,
          author_display_name: profile?.display_name ?? null,
          author_avatar_url: profile?.avatar_url ?? null,
        };
      });

      // Reverse to show oldest first (Instagram style).
      resultMap.set(targetId, commentsWithAuthors.reverse());
    });
  } catch (err) {
    if (__DEV__) {
      logger.warn('[fetchCommentPreviews] Error:', err);
    }
  }

  return resultMap;
}

/**
 * Fetch the set of target_ids that the given user has liked.
 * Used to rehydrate likedByMe state on app start / feed refresh.
 */
export async function fetchMyLikedIds(
  userId: string,
  targetType: LikeTargetType,
  targetIds: string[],
): Promise<Set<string>> {
  if (isDemoMode) {
    return new Set(targetIds.filter((id) => getDemoLikeState(targetType, id).liked));
  }
  if (!userId || targetIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('likes_v2')
    .select('target_id')
    .eq('user_id', userId)
    .eq('target_type', targetType)
    .in('target_id', targetIds);

  if (error) {
    if (__DEV__) {
      logger.warn('[fetchMyLikedIds] Error:', error);
    }
    return new Set();
  }

  return new Set((data || []).map((r) => r.target_id));
}

/**
 * Toggle like for a target (insert if not liked, delete if liked)
 */
export async function toggleLike(
  targetType: LikeTargetType,
  targetId: string,
  userId: string,
  currentlyLiked: boolean,
): Promise<boolean> {
  if (isDemoMode) {
    toggleDemoLike(targetType, targetId);
    return true;
  }
  if (currentlyLiked) {
    // Delete like
    const { error } = await supabase
      .from('likes_v2')
      .delete()
      .eq('user_id', userId)
      .eq('target_type', targetType)
      .eq('target_id', targetId);

    if (error) {
      logger.error('[toggleLike] Delete error:', error);
      return false;
    }
    return true;
  } else {
    // Insert like
    const { error } = await supabase.from('likes_v2').insert({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
    });

    if (error) {
      logger.error('[toggleLike] Insert error:', error);
      return false;
    }
    return true;
  }
}
