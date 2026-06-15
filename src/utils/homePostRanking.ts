import type { FeedPostData, FeedRankingSignals } from '../types/feed';

const MS_PER_HOUR = 1000 * 60 * 60;

type HomeDatedRankingData = FeedRankingSignals & {
  createdAt?: string | null;
};

export const HOME_POST_RECENCY_RANKING = {
  maxPoints: 72,
  windowHours: 96,
  freshnessFloorHours: 2,
  freshnessFloorPoints: 38,
} as const;

export const HOME_POST_ENGAGEMENT_RANKING = {
  likeWeight: 1,
  commentWeight: 2,
  maxPoints: 20,
  decayStartsAfterHours: 96,
  decayHalfLifeHours: 24,
  noBoostAfterHours: 24 * 14,
} as const;

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getHomePostRecencyScore(
  post: FeedPostData,
  now: Date,
): number {
  const recencyScore = getHomeContentRecencyScore(post, now);
  const createdAt = toTimestamp(post.createdAt ?? post.sortDate ?? null);
  if (!createdAt) {
    return 0;
  }

  const ageHours = Math.max(0, (now.getTime() - createdAt) / MS_PER_HOUR);
  if (ageHours <= HOME_POST_RECENCY_RANKING.freshnessFloorHours) {
    return Math.max(recencyScore, HOME_POST_RECENCY_RANKING.freshnessFloorPoints);
  }

  return recencyScore;
}

export function getHomeContentRecencyScore(
  content: HomeDatedRankingData,
  now: Date,
): number {
  const createdAt = toTimestamp(content.createdAt ?? content.sortDate ?? null);
  if (!createdAt) {
    return 0;
  }

  const ageHours = Math.max(0, (now.getTime() - createdAt) / MS_PER_HOUR);
  const cappedAgeHours = Math.min(ageHours, HOME_POST_RECENCY_RANKING.windowHours);
  const remainingRatio = 1 - cappedAgeHours / HOME_POST_RECENCY_RANKING.windowHours;
  return HOME_POST_RECENCY_RANKING.maxPoints * Math.max(0, remainingRatio);
}

export function getHomeContentEngagementScore(
  content: HomeDatedRankingData,
  now: Date,
): number {
  const likeCount = Math.max(0, content.likeCount ?? 0);
  const commentCount = Math.max(0, content.commentCount ?? 0);
  const cappedEngagement = Math.min(
    likeCount * HOME_POST_ENGAGEMENT_RANKING.likeWeight +
      commentCount * HOME_POST_ENGAGEMENT_RANKING.commentWeight,
    HOME_POST_ENGAGEMENT_RANKING.maxPoints,
  );

  if (content.isSystemCard || cappedEngagement === 0) {
    return cappedEngagement;
  }

  const createdAt = toTimestamp(content.createdAt ?? content.sortDate ?? null);
  if (!createdAt) {
    return 0;
  }

  const ageHours = Math.max(0, (now.getTime() - createdAt) / MS_PER_HOUR);
  if (ageHours >= HOME_POST_ENGAGEMENT_RANKING.noBoostAfterHours) {
    return 0;
  }
  if (ageHours <= HOME_POST_ENGAGEMENT_RANKING.decayStartsAfterHours) {
    return cappedEngagement;
  }

  const decayHours =
    ageHours - HOME_POST_ENGAGEMENT_RANKING.decayStartsAfterHours;
  const decayMultiplier = Math.pow(
    0.5,
    decayHours / HOME_POST_ENGAGEMENT_RANKING.decayHalfLifeHours,
  );

  return cappedEngagement * decayMultiplier;
}

export function getHomePostRankingScore(
  post: FeedPostData,
  now: Date,
): number {
  return (
    getHomePostRecencyScore(post, now) +
    getHomeContentEngagementScore(post, now)
  );
}
