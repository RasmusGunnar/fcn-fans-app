export function buildCommunityFeedTargetFilter(communityId: string): string {
  return JSON.stringify([`community:${communityId}`]);
}
