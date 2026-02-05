export type ProfileMap = Record<string, { display_name: string | null; avatar_url: string | null }>;

export function resolveProfileDisplayName(
  profileMap: ProfileMap | undefined,
  userId: string | undefined,
  fallbackEmail?: string,
): string {
  if (userId && profileMap?.[userId]?.display_name) {
    return profileMap[userId].display_name as string;
  }
  if (fallbackEmail) return fallbackEmail;
  return 'Ukendt';
}

type ResolveActorLineInput = {
  actorType: 'user' | 'community';
  authorId?: string | null;
  authorEmail?: string | null;
  profileMap?: ProfileMap;
  communityName?: string | null;
};

export function resolveActorLine({
  actorType,
  authorId,
  authorEmail,
  profileMap,
  communityName,
}: ResolveActorLineInput): { displayName: string; avatarUrl?: string | null } {
  if (actorType === 'community' && communityName) {
    return { displayName: communityName };
  }

  if (authorId && profileMap?.[authorId]?.display_name) {
    return {
      displayName: profileMap[authorId].display_name as string,
      avatarUrl: profileMap[authorId].avatar_url ?? null,
    };
  }

  if (authorEmail) {
    return { displayName: authorEmail };
  }

  return { displayName: 'Ukendt' };
}