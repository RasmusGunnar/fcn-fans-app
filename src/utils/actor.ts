import type { FanLevelKey } from '../types/fan';

export type ProfileMap = Record<
  string,
  {
    display_name: string | null;
    username?: string | null;
    avatar_url: string | null;
    fan_level_key?: FanLevelKey | null;
  }
>;

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

type ResolvePostActorIdentityInput = {
  actorType?: 'user' | 'community' | null;
  actorDisplayName?: string | null;
  actorAvatarUrl?: string | null;
  communityName?: string | null;
  authorId?: string | null;
  authorDisplayName?: string | null;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
};

export type ResolvedPostActorIdentity = {
  actorType: 'user' | 'community';
  displayName: string;
  avatarUrl: string | null;
  avatarUserId?: string;
};

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function resolvePostActorIdentity({
  actorType,
  actorDisplayName,
  actorAvatarUrl,
  communityName,
  authorId,
  authorDisplayName,
  authorName,
  authorAvatarUrl,
}: ResolvePostActorIdentityInput): ResolvedPostActorIdentity {
  if (actorType === 'community') {
    return {
      actorType: 'community',
      displayName: firstNonEmpty(actorDisplayName, communityName) ?? 'Fællesskab',
      avatarUrl: firstNonEmpty(actorAvatarUrl),
    };
  }

  const normalizedAuthorId = firstNonEmpty(authorId) ?? undefined;

  return {
    actorType: 'user',
    displayName: firstNonEmpty(authorDisplayName, authorName) ?? 'Ukendt',
    avatarUrl: firstNonEmpty(authorAvatarUrl),
    ...(normalizedAuthorId ? { avatarUserId: normalizedAuthorId } : {}),
  };
}
