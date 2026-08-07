import type { ConversationSummary, DirectMessage } from '../types/messages';

export type DirectMessageSendAttempt = {
  body: string;
  clientMessageId: string;
};

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeUnreadCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function formatMessageUnreadBadge(unreadCount: number): string | null {
  const normalizedCount = normalizeUnreadCount(unreadCount);
  if (normalizedCount === 0) return null;
  return normalizedCount > 99 ? '99+' : String(normalizedCount);
}

export function getMessageInboxAccessibilityLabel(unreadCount: number): string {
  const normalizedCount = normalizeUnreadCount(unreadCount);
  if (normalizedCount === 0) return 'Beskeder, ingen ulæste';
  return `Beskeder, ${normalizedCount} ulæst${normalizedCount === 1 ? '' : 'e'}`;
}

export function sanitizeDirectMessagePreview(body: string, maxLength = 90): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Du har fået en ny besked';
  return normalized.slice(0, Math.max(1, maxLength));
}

export function mapDirectMessageInboxRow(row: Record<string, unknown>): ConversationSummary {
  const username = readOptionalString(row.peer_username);
  return {
    id: String(row.conversation_id ?? ''),
    peer: {
      id: String(row.peer_id ?? ''),
      displayName: readOptionalString(row.peer_display_name) ?? username ?? 'FCN-fan',
      username,
      avatarUrl: readOptionalString(row.peer_avatar_url),
    },
    lastMessageId: String(row.last_message_id ?? ''),
    lastMessageBody: String(row.last_message_body ?? ''),
    lastMessageSenderId: String(row.last_message_sender_id ?? ''),
    lastMessageAt: String(row.last_message_at ?? ''),
    unreadCount: Number(row.unread_count ?? 0),
    blocked: Boolean(row.blocked),
    blockedByMe: Boolean(row.blocked_by_me),
  };
}

export function createOrReuseDirectMessageSendAttempt(
  body: string,
  pending: DirectMessageSendAttempt | null,
  createClientMessageId: () => string,
): DirectMessageSendAttempt | null {
  const normalizedBody = body.trim();
  if (!normalizedBody) return null;
  if (pending?.body === normalizedBody) return pending;
  return { body: normalizedBody, clientMessageId: createClientMessageId() };
}

export function canSubmitDirectMessage(params: {
  body: string;
  blocked: boolean;
  sending: boolean;
}): boolean {
  return !params.blocked && !params.sending && params.body.trim().length > 0;
}

export function parseDirectMessageDeepLink(value: string): string | null {
  const match = value
    .trim()
    .match(/(?:^|\/|:\/\/)messages\/([0-9a-f]{8}-[0-9a-f-]{27,})?(?:[?#/]|$)/i);
  return match?.[1] ?? null;
}

export function formatDirectMessageTimestamp(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('da-DK', {
    day: '2-digit',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function getDirectMessageNotificationConversationId(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  const targetType = payload?.targetType ?? payload?.type;
  const conversationId = payload?.conversationId;
  return targetType === 'direct_message' &&
    typeof conversationId === 'string' &&
    conversationId.trim().length > 0
    ? conversationId.trim()
    : null;
}

export function mergeDirectMessages(
  current: DirectMessage[],
  incoming: DirectMessage[],
): DirectMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return Array.from(byId.values()).sort((left, right) => {
    const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return timeDifference || right.id.localeCompare(left.id);
  });
}

export function getDirectMessageErrorMessage(error: unknown): string {
  const message = String(
    (error as { message?: unknown } | null)?.message ?? error ?? '',
  ).toLowerCase();

  if (message.includes('direct_message_blocked')) {
    return 'I kan ikke sende beskeder til hinanden.';
  }
  if (message.includes('conversation_rate_limited')) {
    return 'Du har startet for mange samtaler. Prøv igen om lidt.';
  }
  if (message.includes('send_rate_limited')) {
    return 'Du sender beskeder for hurtigt. Vent et øjeblik.';
  }
  if (message.includes('body_length')) {
    return 'Beskeden skal være mellem 1 og 2.000 tegn.';
  }
  if (message.includes('conversation_not_found') || message.includes('user_not_found')) {
    return 'Samtalen er ikke længere tilgængelig.';
  }

  return 'Beskeden kunne ikke sendes. Prøv igen.';
}
