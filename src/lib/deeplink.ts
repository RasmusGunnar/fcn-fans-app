import * as Linking from 'expo-linking';

const APP_SCHEME = 'fcnfans://';

type NotificationPayload = Record<string, unknown> | null | undefined;
type NotificationTargetType =
  | 'home_feed'
  | 'post'
  | 'post_comment'
  | 'comment_reply'
  | 'community_post'
  | 'community_poll'
  | 'event'
  | 'match'
  | 'direct_message';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNotificationTargetType(value: string | null): NotificationTargetType | null {
  if (value === 'home_feed' || value === 'discovery_home') return 'home_feed';
  if (
    value === 'post' ||
    value === 'post_comment' ||
    value === 'comment_reply' ||
    value === 'community_post' ||
    value === 'community_poll' ||
    value === 'event' ||
    value === 'match' ||
    value === 'direct_message'
  ) {
    return value;
  }
  return null;
}

function isPostDetailTargetType(value: NotificationTargetType | null): boolean {
  return (
    value === 'post' ||
    value === 'post_comment' ||
    value === 'comment_reply' ||
    value === 'community_post' ||
    value === 'community_poll'
  );
}

export function createHomeDeepLink(params?: {
  postId?: string | null;
  feedItemType?: string | null;
}): string {
  const postId = readString(params?.postId);
  const feedItemType = readString(params?.feedItemType);
  return Linking.createURL('/home', {
    queryParams: {
      ...(postId ? { focusPostId: postId } : {}),
      ...(feedItemType ? { feedItemType } : {}),
    },
  });
}

export function createPostDeepLink(postId: string): string {
  return Linking.createURL(`/post/${postId}`);
}

export function createMatchDeepLink(fixtureId: string): string {
  return Linking.createURL(`/match/${fixtureId}`);
}

export function createEventDeepLink(eventId: string): string {
  return Linking.createURL(`/event/${eventId}`);
}

export function createDirectMessageDeepLink(conversationId: string): string {
  const normalizedConversationId = conversationId.trim();
  return normalizedConversationId
    ? `${APP_SCHEME}messages/${encodeURIComponent(normalizedConversationId)}`
    : `${APP_SCHEME}messages`;
}

export function createFanActivityDeepLink(params: {
  parentType: 'match' | 'event';
  parentId: string;
  fanActivityId: string;
}): string {
  const parentId = params.parentId.trim();
  const fanActivityId = params.fanActivityId.trim();

  if (!parentId || !fanActivityId) {
    return `${APP_SCHEME}home`;
  }

  const encodedParentId = encodeURIComponent(parentId);
  const encodedFanActivityId = encodeURIComponent(fanActivityId);
  const path =
    params.parentType === 'match'
      ? `match/${encodedParentId}/fan-activity/${encodedFanActivityId}`
      : `event/${encodedParentId}/fan-activity/${encodedFanActivityId}`;

  return `${APP_SCHEME}${path}`;
}

export function getNotificationDeepLink(data: NotificationPayload): string | null {
  return getNotificationDeepLinkWithOptions(data);
}

export function getNotificationDeepLinkWithOptions(
  data: NotificationPayload,
  options?: { includeHomeFallback?: boolean },
): string | null {
  const payload = data ?? {};
  const includeHomeFallback = options?.includeHomeFallback ?? true;
  const postId = readString(payload.postId ?? payload.targetId);
  const fixtureId = readString(payload.fixtureId ?? payload.matchId ?? payload.targetId);
  const eventId = readString(payload.eventId ?? payload.targetId);
  const fanActivityId = readString(payload.fanActivityId);
  const conversationId = readString(payload.conversationId ?? payload.targetId);
  const targetType = normalizeNotificationTargetType(readString(payload.targetType));
  const legacyType = normalizeNotificationTargetType(readString(payload.type));
  const resolvedType = targetType ?? legacyType;

  if (resolvedType === 'direct_message' && conversationId) {
    return createDirectMessageDeepLink(conversationId);
  }

  if (resolvedType === 'home_feed') {
    return createHomeDeepLink({
      postId,
      feedItemType: readString(payload.feedItemType ?? payload.postType),
    });
  }

  if (isPostDetailTargetType(resolvedType) && postId) {
    return createPostDeepLink(postId);
  }

  if (resolvedType === 'match' && fixtureId) {
    if (fanActivityId) {
      return createFanActivityDeepLink({
        parentType: 'match',
        parentId: fixtureId,
        fanActivityId,
      });
    }

    return createMatchDeepLink(fixtureId);
  }

  if (resolvedType === 'event' && eventId) {
    if (fanActivityId) {
      return createFanActivityDeepLink({
        parentType: 'event',
        parentId: eventId,
        fanActivityId,
      });
    }

    return createEventDeepLink(eventId);
  }

  const explicitUrl = readString(payload.url);
  if (explicitUrl) {
    return explicitUrl;
  }

  return includeHomeFallback ? createHomeDeepLink() : null;
}
