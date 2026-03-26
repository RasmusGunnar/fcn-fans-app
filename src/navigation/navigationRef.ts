import { createNavigationContainerRef } from '@react-navigation/native';
import { logger } from '../lib/logger';

type NotificationPayload = Record<string, unknown> | null | undefined;
type NotificationTargetType =
  | 'home_feed'
  | 'post'
  | 'post_comment'
  | 'comment_reply'
  | 'community_post'
  | 'community_poll'
  | 'event'
  | 'match';
type PostDetailTargetType =
  | 'post'
  | 'post_comment'
  | 'comment_reply'
  | 'community_post'
  | 'community_poll';
type PostDetailParams = {
  postId: string;
  targetType: PostDetailTargetType;
  notificationType?: string;
  commentId?: string;
  parentCommentId?: string;
  communityId?: string;
  entityId?: string;
  entityType?: string;
  previewText?: string;
  isPoll?: boolean;
};

type ResolvedNotificationRoute =
  | {
      targetType: 'home_feed';
      routeLabel: 'Main > Home > HomeMain';
      fallback: boolean;
    }
  | {
      targetType: PostDetailTargetType;
      routeLabel: 'Main > Home > PostDetail';
      params: PostDetailParams;
      fallback: boolean;
    }
  | {
      targetType: 'event';
      routeLabel: 'Main > Events > EventDetails';
      eventId: string;
      fallback: boolean;
    }
  | {
      targetType: 'match';
      routeLabel: 'Main > Home > MatchDetails';
      fixtureId: string;
      fallback: boolean;
    };

export const navigationRef = createNavigationContainerRef<any>();

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
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
    value === 'match'
  ) {
    return value;
  }
  return null;
}

function isPostDetailTargetType(value: NotificationTargetType | null): value is PostDetailTargetType {
  return (
    value === 'post' ||
    value === 'post_comment' ||
    value === 'comment_reply' ||
    value === 'community_post' ||
    value === 'community_poll'
  );
}

function buildPostDetailParams(
  payload: Record<string, unknown>,
  postId: string,
  targetType: PostDetailTargetType,
): PostDetailParams {
  const params: PostDetailParams = { postId, targetType };
  const notificationType = readString(payload.notificationType);
  const commentId = readString(payload.commentId);
  const parentCommentId = readString(payload.parentCommentId);
  const communityId = readString(payload.communityId);
  const entityId = readString(payload.entityId);
  const entityType = readString(payload.entityType);
  const previewText = readString(payload.previewText);
  const isPoll = readBoolean(payload.isPoll);

  if (notificationType) params.notificationType = notificationType;
  if (commentId) params.commentId = commentId;
  if (parentCommentId) params.parentCommentId = parentCommentId;
  if (communityId) params.communityId = communityId;
  if (entityId) params.entityId = entityId;
  if (entityType) params.entityType = entityType;
  if (previewText) params.previewText = previewText;
  if (typeof isPoll === 'boolean') params.isPoll = isPoll;

  return params;
}

export function navigateToHomeFeed() {
  navigationRef.navigate('Main', {
    screen: 'Home',
    params: { screen: 'HomeMain' },
  });
}

function resolveNotificationRoute(payload: Record<string, unknown>): ResolvedNotificationRoute {
  const targetType = normalizeNotificationTargetType(readString(payload.targetType));
  const legacyType = normalizeNotificationTargetType(readString(payload.type));
  const resolvedType = targetType ?? legacyType;
  const postId = readString(payload.postId ?? payload.targetId);
  const fixtureId = readString(payload.fixtureId ?? payload.matchId ?? payload.targetId);
  const eventId = readString(payload.eventId ?? payload.targetId);

  if (resolvedType === 'home_feed') {
    return {
      targetType: 'home_feed',
      routeLabel: 'Main > Home > HomeMain',
      fallback: false,
    };
  }

  if (isPostDetailTargetType(resolvedType) && postId) {
    return {
      targetType: resolvedType,
      routeLabel: 'Main > Home > PostDetail',
      params: buildPostDetailParams(payload, postId, resolvedType),
      fallback: false,
    };
  }

  if (resolvedType === 'match' && fixtureId) {
    return {
      targetType: 'match',
      routeLabel: 'Main > Home > MatchDetails',
      fixtureId,
      fallback: false,
    };
  }

  if (resolvedType === 'event' && eventId) {
    return {
      targetType: 'event',
      routeLabel: 'Main > Events > EventDetails',
      eventId,
      fallback: false,
    };
  }

  return {
    targetType: 'home_feed',
    routeLabel: 'Main > Home > HomeMain',
    fallback: true,
  };
}

export function navigateFromNotificationData(
  data: NotificationPayload,
  options?: { allowHomeFallback?: boolean },
): boolean {
  if (!navigationRef.isReady()) {
    logger.log('[NotificationRoute] nav not ready', { payload: data ?? null });
    return false;
  }

  const payload = data ?? {};
  const resolvedRoute = resolveNotificationRoute(payload);
  const allowHomeFallback = options?.allowHomeFallback ?? true;

  logger.log('[NotificationRoute] resolved', {
    payload,
    resolvedTargetType: resolvedRoute.targetType,
    route: resolvedRoute.routeLabel,
    fallback: resolvedRoute.fallback,
  });

  if (resolvedRoute.routeLabel === 'Main > Home > PostDetail') {
    navigationRef.navigate('Main', {
      screen: 'Home',
      params: { screen: 'PostDetail', params: resolvedRoute.params },
    });
    return true;
  }

  if (resolvedRoute.targetType === 'match') {
    navigationRef.navigate('Main', {
      screen: 'Home',
      params: { screen: 'MatchDetails', params: { fixtureId: resolvedRoute.fixtureId } },
    });
    return true;
  }

  if (resolvedRoute.targetType === 'event') {
    navigationRef.navigate('Main', {
      screen: 'Events',
      params: { screen: 'EventDetails', params: { eventId: resolvedRoute.eventId } },
    });
    return true;
  }

  if (resolvedRoute.fallback && !allowHomeFallback) {
    logger.log('[NotificationRoute] defer home fallback', { payload });
    return false;
  }

  navigateToHomeFeed();
  return true;
}
