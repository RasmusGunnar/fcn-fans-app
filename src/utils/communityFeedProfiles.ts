export function mergeCommunityFeedProfiles<TProfile>(
  profileMap: Record<string, TProfile>,
  communityProfileMap: Record<string, TProfile>,
): Record<string, TProfile> {
  return {
    ...profileMap,
    ...communityProfileMap,
  };
}
