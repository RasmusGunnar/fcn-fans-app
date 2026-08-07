import type {
  ConversationDetails,
  ConversationMessage,
  ConversationRole,
  ConversationSummary,
  ConversationType,
  MessagePeer,
  MessageType,
} from '../types/messages';

export type DirectMessageSendAttempt = {
  body: string;
  clientMessageId: string;
};

export type TypingUser = {
  userId: string;
  displayName: string;
  expiresAt: number;
};

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readConversationType(value: unknown): ConversationType {
  return value === 'group' ? 'group' : 'direct';
}

function readConversationRole(value: unknown): ConversationRole {
  return value === 'owner' || value === 'admin' ? value : 'member';
}

function readMessageType(value: unknown): MessageType | null {
  return value === 'text' || value === 'image' || value === 'image_text' ? value : null;
}

function normalizeUnreadCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function mapPeer(row: Record<string, unknown>): MessagePeer | null {
  const id = readOptionalString(row.peer_id);
  if (!id) return null;
  const username = readOptionalString(row.peer_username);
  return {
    id,
    displayName: readOptionalString(row.peer_display_name) ?? username ?? 'FCN-fan',
    username,
    avatarUrl: readOptionalString(row.peer_avatar_url),
  };
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

export function mapConversationInboxRow(row: Record<string, unknown>): ConversationSummary {
  const type = readConversationType(row.conversation_type);
  const peer = mapPeer(row);
  const activityAt = String(row.activity_at ?? row.last_message_at ?? '');
  return {
    id: String(row.conversation_id ?? ''),
    type,
    name: readOptionalString(row.conversation_name),
    avatarPath: readOptionalString(row.conversation_avatar_path),
    avatarUrl: null,
    peer,
    lastMessageId: readOptionalString(row.last_message_id),
    lastMessageBody: readOptionalString(row.last_message_body),
    lastMessageType:
      readMessageType(row.last_message_type) ??
      (readOptionalString(row.last_message_id) ? 'text' : null),
    lastMessageMediaPath: readOptionalString(row.last_message_media_path),
    lastMessageSenderId: readOptionalString(row.last_message_sender_id),
    lastMessageSenderName: readOptionalString(row.last_message_sender_name),
    lastMessageAt: readOptionalString(row.last_message_at),
    activityAt,
    unreadCount: Number(row.unread_count ?? 0),
    blocked: type === 'direct' && Boolean(row.blocked),
    blockedByMe: type === 'direct' && Boolean(row.blocked_by_me),
    memberCount: Number(row.member_count ?? (type === 'direct' ? 2 : 0)),
    currentUserRole: readConversationRole(row.current_user_role),
    peerLastReadAt: null,
    peerLastReadMessageId: null,
  };
}

export function mapDirectMessageInboxRow(row: Record<string, unknown>): ConversationSummary {
  return mapConversationInboxRow({
    conversation_type: 'direct',
    activity_at: row.last_message_at,
    last_message_type: 'text',
    member_count: 2,
    current_user_role: 'member',
    ...row,
  });
}

export function getConversationTitle(
  conversation: Pick<ConversationDetails, 'type' | 'name' | 'peer'>,
): string {
  return conversation.type === 'group'
    ? conversation.name?.trim() || 'Gruppe'
    : conversation.peer?.displayName || 'Samtale';
}

export function getConversationPreview(
  conversation: Pick<
    ConversationSummary,
    'type' | 'lastMessageBody' | 'lastMessageType' | 'lastMessageSenderId' | 'lastMessageSenderName'
  >,
  currentUserId: string | null | undefined,
): string {
  if (!conversation.lastMessageType) return 'Ingen beskeder endnu';
  const content =
    conversation.lastMessageType === 'text'
      ? conversation.lastMessageBody || 'Besked slettet'
      : `${String.fromCodePoint(0x1f4f7)} Billede`;
  if (conversation.lastMessageSenderId === currentUserId) return `Dig: ${content}`;
  if (conversation.type === 'group' && conversation.lastMessageSenderName) {
    return `${conversation.lastMessageSenderName}: ${content}`;
  }
  return content;
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
  hasImage?: boolean;
  blocked: boolean;
  sending: boolean;
}): boolean {
  return (
    !params.blocked &&
    !params.sending &&
    (params.body.trim().length > 0 || params.hasImage === true)
  );
}

export function validateGroupCreation(name: string, selectedUserIds: string[]): string | null {
  const uniqueIds = new Set(selectedUserIds.filter(Boolean));
  if (name.trim().length < 1 || name.trim().length > 80) {
    return 'Gruppen skal have et navn på højst 80 tegn.';
  }
  if (uniqueIds.size < 1) return 'Vælg mindst en anden fan.';
  if (uniqueIds.size > 9) return 'Du kan vælge højst 9 andre fans.';
  return null;
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

export function formatMessageDateSeparator(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startOfToday - startOfDate) / 86400000);
  if (dayDifference === 0) return 'I dag';
  if (dayDifference === 1) return 'I går';
  return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
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
  current: ConversationMessage[],
  incoming: ConversationMessage[],
): ConversationMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((left, right) => {
    const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return timeDifference || right.id.localeCompare(left.id);
  });
}

export function isLatestOwnDirectMessageSeen(params: {
  message: ConversationMessage;
  latestOwnMessageId: string | null;
  peerLastReadAt: string | null;
  peerLastReadMessageId: string | null;
}): boolean {
  if (!params.latestOwnMessageId || params.message.id !== params.latestOwnMessageId) return false;
  if (!params.peerLastReadAt) return false;
  const readTime = Date.parse(params.peerLastReadAt);
  const messageTime = Date.parse(params.message.createdAt);
  if (readTime > messageTime) return true;
  return (
    readTime === messageTime &&
    Boolean(params.peerLastReadMessageId) &&
    String(params.peerLastReadMessageId).localeCompare(params.message.id) >= 0
  );
}

export function updateTypingUsers(
  current: TypingUser[],
  event: { userId: string; displayName: string; typing: boolean },
  ownUserId: string,
  now: number,
): TypingUser[] {
  const active = current.filter((item) => item.expiresAt > now && item.userId !== event.userId);
  if (event.userId === ownUserId || !event.typing) return active;
  return [
    ...active,
    { userId: event.userId, displayName: event.displayName, expiresAt: now + 3000 },
  ];
}

export function getTypingLabel(users: TypingUser[]): string | null {
  if (users.length === 0) return null;
  if (users.length === 1) return `${users[0].displayName} skriver...`;
  if (users.length === 2) return `${users[0].displayName} og ${users[1].displayName} skriver...`;
  return 'Flere skriver...';
}

export function getDirectMessageErrorMessage(error: unknown): string {
  const message = String(
    (error as { message?: unknown } | null)?.message ?? error ?? '',
  ).toLowerCase();
  if (message.includes('direct_message_blocked')) return 'I kan ikke sende beskeder til hinanden.';
  if (message.includes('group_member_limit')) return 'Gruppen kan højst have 10 medlemmer.';
  if (message.includes('group_admin_required') || message.includes('group_role_forbidden')) {
    return 'Du har ikke adgang til denne gruppehandling.';
  }
  if (message.includes('group_owner_cannot_leave')) {
    return 'Ejeren kan ikke forlade gruppen.';
  }
  if (message.includes('conversation_rate_limited')) {
    return 'Du har startet for mange samtaler. Prøv igen om lidt.';
  }
  if (message.includes('send_rate_limited')) {
    return 'Du sender beskeder for hurtigt. Vent et øjeblik.';
  }
  if (message.includes('body_length') || message.includes('content_check')) {
    return 'Beskeden skal være mellem 1 og 2.000 tegn.';
  }
  if (message.includes('conversation_not_found') || message.includes('user_not_found')) {
    return 'Samtalen er ikke længere tilgængelig.';
  }
  return 'Beskeden kunne ikke sendes. Prøv igen.';
}
