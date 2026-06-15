import { isFanLevelKey } from '../lib/fanLevel';
import type { FanLevelKey } from '../types/fan';
import type { PostType } from '../types/post';

export type FanPostBadgeAuthorProfile = {
  display_name: string | null;
  avatar_url: string | null;
  fan_level_key?: FanLevelKey | null;
};

type ResolveFanPostBadgeCandidateInput = {
  postType: PostType;
  actorType?: 'user' | 'community';
  authorProfile?: Pick<FanPostBadgeAuthorProfile, 'fan_level_key'>;
  postAuthorFanLevelKey?: FanLevelKey | null;
};

export function resolveFanPostBadgeCandidate({
  postType,
  actorType,
  authorProfile,
  postAuthorFanLevelKey,
}: ResolveFanPostBadgeCandidateInput): FanLevelKey | null {
  if (postType === 'media_article' || actorType === 'community') {
    return null;
  }

  const candidate =
    authorProfile === undefined ? postAuthorFanLevelKey : authorProfile.fan_level_key;

  return isFanLevelKey(candidate) ? candidate : null;
}

export function resolveFeedItemAuthorProfile(
  authorId: string | undefined,
  profileMap: Record<string, FanPostBadgeAuthorProfile>,
): FanPostBadgeAuthorProfile | undefined {
  return authorId ? profileMap[authorId] : undefined;
}
