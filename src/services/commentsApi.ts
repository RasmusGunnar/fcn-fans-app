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
    console.warn('[commentsApi] TODO: toggleCommentLike not wired', input);
  }
  return true;
}

// TODO: Replace stub with real API call once backend supports replies.
export async function addCommentReply(input: AddCommentReplyInput): Promise<CommentReplyRecord> {
  if (__DEV__) {
    console.warn('[commentsApi] TODO: addCommentReply not wired', {
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
