export type CommentLikeTreeItem = {
  id: string;
  likeCount: number;
  likedByMe: boolean;
  replies?: CommentLikeTreeItem[];
};

function toggleCommentLikeState<T extends CommentLikeTreeItem>(comment: T): T {
  const likedByMe = !comment.likedByMe;
  return {
    ...comment,
    likedByMe,
    likeCount: Math.max(0, comment.likeCount + (likedByMe ? 1 : -1)),
  };
}

export function applyOptimisticCommentLikeToggle<T extends CommentLikeTreeItem>(
  comments: readonly T[],
  commentId: string,
): { comments: T[]; toggledComment: T | null } {
  let toggledComment: T | null = null;

  const nextComments = comments.map((comment) => {
    if (comment.id === commentId) {
      toggledComment = toggleCommentLikeState(comment);
      return toggledComment;
    }

    let didUpdateReply = false;
    const nextReplies = (comment.replies ?? []).map((reply) => {
      if (reply.id !== commentId) return reply;
      didUpdateReply = true;
      const toggledReply = toggleCommentLikeState(reply);
      toggledComment = toggledReply as T;
      return toggledReply;
    });

    return didUpdateReply
      ? ({
          ...comment,
          replies: nextReplies,
        } as T)
      : comment;
  });

  return {
    comments: toggledComment ? nextComments : [...comments],
    toggledComment,
  };
}
