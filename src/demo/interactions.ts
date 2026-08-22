import type { LikeTargetType } from '../services/likesApi';
import type { PollVotesMap } from '../services/pollService';
import type { DiscussionPost } from '../types/discussion';
import { DEMO_CURRENT_USER, getDemoUser } from './users';
import { DEMO_DISCUSSION_POSTS } from './discussions';
import { DEMO_COMMENTS, DEMO_ENGAGEMENT, type DemoCommentRecord } from './posts';

type LocalLikeState = { liked: boolean; likes: number };

const initialPollVotes: PollVotesMap = {
  'demo-post-06': {
    optionVotes: {
      'poll-points-9': 41,
      'poll-points-7': 73,
      'poll-points-4-6': 56,
      'poll-points-less': 16,
    },
    voters: {
      'poll-points-9': ['demo-user-02'],
      'poll-points-7': ['demo-user-03', 'demo-user-04'],
      'poll-points-4-6': ['demo-user-05'],
      'poll-points-less': ['demo-user-06'],
    },
  },
  'demo-post-11': {
    optionVotes: {
      'poll-player-midfield': 48,
      'poll-player-wing': 62,
      'poll-player-keeper': 31,
      'poll-player-striker': 27,
    },
    voters: {
      'poll-player-midfield': ['demo-user-07'],
      'poll-player-wing': ['demo-user-08', 'demo-user-09'],
      'poll-player-keeper': ['demo-user-10'],
      'poll-player-striker': ['demo-user-11'],
    },
  },
  'demo-post-16': {
    optionVotes: { 'poll-away-train': 54, 'poll-away-car': 37, 'poll-away-bus': 51 },
    voters: {
      'poll-away-train': ['demo-user-12'],
      'poll-away-car': ['demo-user-13'],
      'poll-away-bus': ['demo-user-14', 'demo-user-15'],
    },
  },
};

let localLikes: Record<string, LocalLikeState> = {};
let localComments: DemoCommentRecord[] = [];
let localPollVotes: PollVotesMap = structuredClone(initialPollVotes);
let localDiscussionPosts: Record<string, DiscussionPost[]> = {};
let localRsvpGoing = true;
let localCheckedIn = false;

export function resetDemoInteractions(): void {
  localLikes = Object.fromEntries(
    Object.entries(DEMO_ENGAGEMENT).map(([key, value]) => [
      key,
      { liked: value.liked, likes: value.likes },
    ]),
  );
  localComments = DEMO_COMMENTS.map((comment) => ({ ...comment }));
  localPollVotes = structuredClone(initialPollVotes);
  localDiscussionPosts = structuredClone(DEMO_DISCUSSION_POSTS);
  localRsvpGoing = true;
  localCheckedIn = false;
}

resetDemoInteractions();

export function getDemoLikeState(targetType: string, targetId: string): LocalLikeState {
  return localLikes[`${targetType}:${targetId}`] ?? { liked: false, likes: 0 };
}

export function toggleDemoLike(targetType: string, targetId: string): LocalLikeState {
  const key = `${targetType}:${targetId}`;
  const current = getDemoLikeState(targetType, targetId);
  const next = {
    liked: !current.liked,
    likes: current.liked ? Math.max(0, current.likes - 1) : current.likes + 1,
  };
  localLikes[key] = next;
  return next;
}

export function getDemoComments(targetType: string, targetId: string): DemoCommentRecord[] {
  return localComments
    .filter((comment) => comment.target_type === targetType && comment.target_id === targetId)
    .map((comment) => ({ ...comment }));
}

export function getDemoCommentById(commentId: string): DemoCommentRecord | null {
  const comment = localComments.find((item) => item.id === commentId);
  return comment ? { ...comment } : null;
}

export function addDemoComment(input: {
  targetType: DemoCommentRecord['target_type'];
  targetId: string;
  authorId: string;
  text: string;
  parentId?: string | null;
}): DemoCommentRecord {
  const author = getDemoUser(input.authorId) ?? DEMO_CURRENT_USER;
  const comment: DemoCommentRecord = {
    id: `demo-session-comment-${localComments.length + 1}`,
    target_type: input.targetType,
    target_id: input.targetId,
    parent_id: input.parentId ?? null,
    author_id: author.id,
    text: input.text.trim(),
    created_at: new Date().toISOString(),
    author_display_name: author.displayName,
    author_avatar_url: author.avatarUrl,
    like_count: 0,
    liked_by_me: false,
  };
  localComments.push(comment);
  return { ...comment };
}

export function removeDemoComment(commentId: string): void {
  localComments = localComments.filter(
    (comment) => comment.id !== commentId && comment.parent_id !== commentId,
  );
}

export function toggleDemoCommentLike(commentId: string): { liked: boolean; likeCount: number } {
  const comment = localComments.find((item) => item.id === commentId);
  if (!comment) return { liked: false, likeCount: 0 };
  comment.liked_by_me = !comment.liked_by_me;
  comment.like_count = Math.max(0, comment.like_count + (comment.liked_by_me ? 1 : -1));
  return { liked: comment.liked_by_me, likeCount: comment.like_count };
}

export function getDemoPollVotes(postIds: string[]) {
  return Object.fromEntries(
    postIds
      .filter((postId) => postId in localPollVotes)
      .map((postId) => [
        postId,
        structuredClone(localPollVotes[postId as keyof typeof localPollVotes]),
      ]),
  );
}

export function voteInDemoPoll(postId: string, optionId: string): boolean {
  const poll = localPollVotes[postId];
  if (!poll) return false;
  const alreadyVoted = Object.values(poll.voters).some((voters) =>
    voters.includes(DEMO_CURRENT_USER.id),
  );
  if (alreadyVoted || !(optionId in poll.optionVotes)) return alreadyVoted;
  poll.optionVotes[optionId] += 1;
  poll.voters[optionId].push(DEMO_CURRENT_USER.id);
  return true;
}

export function getDemoDiscussionPosts(threadId: string): DiscussionPost[] {
  return structuredClone(localDiscussionPosts[threadId] ?? []);
}

export function addDemoDiscussionPost(input: {
  threadId: string;
  parentPostId?: string | null;
  body: string;
  userId: string;
}): string {
  const author = getDemoUser(input.userId) ?? DEMO_CURRENT_USER;
  const id = `demo-session-discussion-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const post: DiscussionPost = {
    id,
    threadId: input.threadId,
    parentPostId: input.parentPostId ?? null,
    authorId: author.id,
    author: { id: author.id, displayName: author.displayName, avatarUrl: author.avatarUrl },
    body: input.body.trim(),
    createdAt,
    updatedAt: createdAt,
    media: [],
    linkPreview: null,
    reactionCount: 0,
    likedByMe: false,
    replies: [],
  };
  localDiscussionPosts[input.threadId] = [...(localDiscussionPosts[input.threadId] ?? []), post];
  return id;
}

export function toggleDemoDiscussionReaction(postId: string): void {
  Object.values(localDiscussionPosts).forEach((posts) => {
    const visit = (items: DiscussionPost[]): boolean => {
      for (const post of items) {
        if (post.id === postId) {
          post.likedByMe = !post.likedByMe;
          post.reactionCount = Math.max(0, post.reactionCount + (post.likedByMe ? 1 : -1));
          return true;
        }
        if (visit(post.replies)) return true;
      }
      return false;
    };
    visit(posts);
  });
}

export function getDemoParticipation() {
  return { isGoing: localRsvpGoing, isCheckedIn: localCheckedIn };
}

export function setDemoRsvp(status: 'going' | 'interested' | 'not_going' | null): void {
  localRsvpGoing = status === 'going';
}

export function setDemoCheckedIn(checkedIn: boolean): void {
  localCheckedIn = checkedIn;
}

export type ProductionMutationPort = {
  toggleLike: (
    targetType: LikeTargetType,
    targetId: string,
    userId: string,
    currentlyLiked: boolean,
  ) => Promise<boolean>;
};

export function createMutationAdapter(
  mode: 'production' | 'demo',
  production: ProductionMutationPort,
): ProductionMutationPort {
  if (mode === 'production') return production;
  return {
    async toggleLike(targetType, targetId) {
      toggleDemoLike(targetType, targetId);
      return true;
    },
  };
}
