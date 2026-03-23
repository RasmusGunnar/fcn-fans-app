import { createNavigationContainerRef } from '@react-navigation/native';

type NotificationPayload = Record<string, unknown> | null | undefined;

export const navigationRef = createNavigationContainerRef<any>();

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function navigateFromNotificationData(data: NotificationPayload): boolean {
  if (!navigationRef.isReady()) {
    return false;
  }

  const payload = data ?? {};
  const type = readString(payload.type ?? payload.targetType);
  const postId = readString(payload.postId ?? payload.targetId);
  const fixtureId = readString(payload.fixtureId ?? payload.matchId ?? payload.targetId);
  const eventId = readString(payload.eventId ?? payload.targetId);

  if (type === 'post' && postId) {
    navigationRef.navigate('Main', {
      screen: 'Home',
      params: { screen: 'PostDetail', params: { postId } },
    });
    return true;
  }

  if (type === 'match' && fixtureId) {
    navigationRef.navigate('Main', {
      screen: 'Home',
      params: { screen: 'MatchDetails', params: { fixtureId } },
    });
    return true;
  }

  if (type === 'event' && eventId) {
    navigationRef.navigate('Main', {
      screen: 'Events',
      params: { screen: 'EventDetails', params: { eventId } },
    });
    return true;
  }

  return false;
}
