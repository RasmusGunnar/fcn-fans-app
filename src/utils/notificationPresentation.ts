export type NotificationPresentationItem = {
  type: string;
  entity_type?: string | null;
  actor_display_name?: string | null;
  reply_comment_parent_id?: string | null;
  title?: string | null;
};

export type NotificationInteractionKind =
  | 'mention_post'
  | 'mention_comment'
  | 'comment_on_post'
  | 'reply_to_comment';

function readName(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeUnreadCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function formatNotificationUnreadBadge(unreadCount: number): string | null {
  const normalizedCount = normalizeUnreadCount(unreadCount);
  if (normalizedCount === 0) return null;
  return normalizedCount > 99 ? '99+' : String(normalizedCount);
}

export function getNotificationBellAccessibilityLabel(unreadCount: number): string {
  const normalizedCount = normalizeUnreadCount(unreadCount);
  if (normalizedCount === 0) return 'Notifikationer, ingen ul\u00e6ste';
  return `Notifikationer, ${normalizedCount} ul\u00e6st${normalizedCount === 1 ? '' : 'e'}`;
}

export function getNotificationInteractionKind(
  item: NotificationPresentationItem,
): NotificationInteractionKind {
  if (item.type === 'mention') {
    return item.entity_type === 'comment' ? 'mention_comment' : 'mention_post';
  }

  if (item.entity_type === 'comment' && item.reply_comment_parent_id === null) {
    return 'comment_on_post';
  }

  return 'reply_to_comment';
}

export function getNotificationLabel(item: NotificationPresentationItem): string {
  if (item.type !== 'mention' && item.type !== 'reply') {
    return readName(item.title) ?? 'Ny notifikation';
  }

  const interactionKind = getNotificationInteractionKind(item);

  if (interactionKind === 'mention_comment') {
    return 'Du blev nævnt i en kommentar';
  }

  if (interactionKind === 'mention_post') {
    return 'Du blev nævnt i et opslag';
  }

  if (interactionKind === 'comment_on_post') {
    const actorName = readName(item.actor_display_name);
    return actorName
      ? `${actorName} kommenterede på dit opslag`
      : 'Nogen kommenterede på dit opslag';
  }

  return 'Nogen svarede på din kommentar';
}
