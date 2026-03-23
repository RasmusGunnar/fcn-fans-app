import * as Linking from 'expo-linking';

type NotificationPayload = Record<string, unknown> | null | undefined;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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

export function getNotificationDeepLink(data: NotificationPayload): string | null {
  const payload = data ?? {};
  const explicitUrl = readString(payload.url);
  if (explicitUrl) {
    return explicitUrl;
  }

  const postId = readString(payload.postId ?? payload.targetId);
  const fixtureId = readString(payload.fixtureId ?? payload.matchId ?? payload.targetId);
  const eventId = readString(payload.eventId ?? payload.targetId);
  const type = readString(payload.type ?? payload.targetType);

  if (type === 'post' && postId) {
    return createPostDeepLink(postId);
  }

  if (type === 'match' && fixtureId) {
    return createMatchDeepLink(fixtureId);
  }

  if (type === 'event' && eventId) {
    return createEventDeepLink(eventId);
  }

  return null;
}
