import { supabase } from '../lib/supabase';

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
  if (targetIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.rpc('get_like_state_v2', {
    p_target_type: targetType,
    p_target_ids: targetIds,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[fetchLikeStates] RPC error:', error);
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
  if (targetIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.rpc('get_comment_meta_v2', {
    p_target_type: targetType,
    p_target_ids: targetIds,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[fetchCommentCounts] RPC error:', error);
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
  if (targetIds.length === 0) {
    return new Map();
  }

  const resultMap = new Map<string, CommentPreview[]>();

  try {
    // Fetch latest 2 comments for each target
    // MVP: Simple query per target (can be optimized with RPC later)
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
            console.warn(`[fetchCommentPreviews] Error for ${targetId}:`, error);
          }
          resultMap.set(targetId, []);
          return;
        }

        // Fetch author info (display_name, avatar_url) for the comments
        const commentsWithAuthors = await Promise.all(
          (data || []).map(async (comment) => {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_url')
              .eq('id', comment.author_id)
              .single();

            if (__DEV__ && profileError) {
              console.warn(
                `[fetchCommentPreviews] Profile fetch error for ${comment.author_id.substring(0, 8)}:`,
                profileError.message,
              );
            }

            // Guard against undefined profile
            if (!profile) {
              return {
                ...comment,
                author_display_name: null,
                author_avatar_url: null,
              };
            }

            return {
              ...comment,
              author_display_name: profile.display_name || null,
              author_avatar_url: profile.avatar_url || null,
            };
          }),
        );

        // Reverse to show oldest first (Instagram style)
        resultMap.set(targetId, commentsWithAuthors.reverse());
      }),
    );
  } catch (err) {
    if (__DEV__) {
      console.warn('[fetchCommentPreviews] Error:', err);
    }
  }

  return resultMap;
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
  if (currentlyLiked) {
    // Delete like
    const { error } = await supabase
      .from('likes_v2')
      .delete()
      .eq('user_id', userId)
      .eq('target_type', targetType)
      .eq('target_id', targetId);

    if (error) {
      console.error('[toggleLike] Delete error:', error);
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
      console.error('[toggleLike] Insert error:', error);
      return false;
    }
    return true;
  }
}
