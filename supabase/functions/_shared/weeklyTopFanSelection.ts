export type WeeklyTopFanReasonType = 'post' | 'comment' | 'activity' | 'checkin';

export type WeeklyTopFanSelectionMode = 'strict' | 'fallback';

export type WeeklyTopFanCandidate = {
  userId: string;
  postCount: number;
  commentCount: number;
  checkinCount: number;
  postLikesReceived: number;
  commentLikesReceived: number;
  activityVariety: number;
  weeklyScore: number;
  latestActivityAt: string | null;
};

export type WeeklyTopFanTopContent = {
  id: string;
  text: string | null;
  likes: number;
  createdAt: string;
};

export const WEEKLY_TOP_FAN_QUALIFYING_SCORE_THRESHOLD = 25;
export const WEEKLY_TOP_FAN_MIN_ACTIVE_SOURCES = 2;

export function getWeeklyTopFanActivitySignalCount(candidate: WeeklyTopFanCandidate): number {
  return (
    candidate.postCount +
    candidate.commentCount +
    candidate.checkinCount +
    candidate.postLikesReceived +
    candidate.commentLikesReceived
  );
}

export function compareWeeklyTopFanCandidates(
  a: WeeklyTopFanCandidate,
  b: WeeklyTopFanCandidate,
): number {
  return (
    b.weeklyScore - a.weeklyScore ||
    b.activityVariety - a.activityVariety ||
    getWeeklyTopFanActivitySignalCount(b) - getWeeklyTopFanActivitySignalCount(a) ||
    b.checkinCount - a.checkinCount ||
    new Date(b.latestActivityAt || 0).getTime() - new Date(a.latestActivityAt || 0).getTime()
  );
}

export function selectWeeklyTopFanWinner(
  allEligibleCandidates: WeeklyTopFanCandidate[],
  recentWinnerIds: Set<string>,
): {
  winner: WeeklyTopFanCandidate | null;
  selectionMode: WeeklyTopFanSelectionMode | null;
  strictCandidates: WeeklyTopFanCandidate[];
  fallbackCandidates: WeeklyTopFanCandidate[];
} {
  const sortedCandidates = [...allEligibleCandidates].sort(compareWeeklyTopFanCandidates);
  const fallbackCandidates = sortedCandidates.filter(
    (candidate) => !recentWinnerIds.has(candidate.userId),
  );
  const strictCandidates = fallbackCandidates
    .filter((candidate) => candidate.weeklyScore >= WEEKLY_TOP_FAN_QUALIFYING_SCORE_THRESHOLD)
    .filter((candidate) => candidate.activityVariety >= WEEKLY_TOP_FAN_MIN_ACTIVE_SOURCES);

  if (strictCandidates[0]) {
    return {
      winner: strictCandidates[0],
      selectionMode: 'strict',
      strictCandidates,
      fallbackCandidates,
    };
  }

  if (fallbackCandidates[0]) {
    return {
      winner: fallbackCandidates[0],
      selectionMode: 'fallback',
      strictCandidates,
      fallbackCandidates,
    };
  }

  return {
    winner: null,
    selectionMode: null,
    strictCandidates,
    fallbackCandidates,
  };
}

export function getWeeklyTopFanReasonType({
  candidate,
  topPost,
  topComment,
}: {
  candidate: WeeklyTopFanCandidate;
  topPost: WeeklyTopFanTopContent | null;
  topComment: WeeklyTopFanTopContent | null;
}): WeeklyTopFanReasonType {
  if (topPost && topPost.likes > 0) {
    return 'post';
  }

  if (topComment && topComment.likes > 0) {
    return 'comment';
  }

  if (candidate.postCount > 0 || candidate.commentCount > 0) {
    return 'activity';
  }

  if (candidate.checkinCount > 0) {
    return 'checkin';
  }

  return 'activity';
}
