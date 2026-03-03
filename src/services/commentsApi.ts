import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export interface CommentLikeToggleInput {
  commentId: string;
  userId: string;
  willLike: boolean;
}

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

// TODO: Replace stubs with real API calls once backend supports comment likes/replies.
export async function toggleCommentLike(input: CommentLikeToggleInput): Promise<boolean> {
  if (__DEV__) {
    logger.warn('[commentsApi] TODO: toggleCommentLike not wired', input);
  }
  return true;
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
