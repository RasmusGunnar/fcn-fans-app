import * as Crypto from 'expo-crypto';
import { signMessageImage } from '../lib/messageMedia';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import type {
  ConversationDetails,
  ConversationMessage,
  ConversationRole,
  ConversationSummary,
  ConversationType,
  DirectMessageReportReason,
  GroupMember,
  InboxCursor,
  MessageCursor,
  MessageMediaUpload,
  MessagePeer,
  MessageType,
  MessageUserSearchResult,
  SendMessageResult,
} from '../types/messages';
import { getDirectMessageErrorMessage, mapConversationInboxRow } from '../utils/directMessages';

type RpcError = { message?: string; code?: string };

export class DirectMessageServiceError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'DirectMessageServiceError';
  }
}

function throwFriendlyError(error: RpcError | null, fallback: string): never {
  const friendlyMessage = getDirectMessageErrorMessage(error);
  throw new DirectMessageServiceError(
    friendlyMessage === 'Beskeden kunne ikke sendes. Prøv igen.' ? fallback : friendlyMessage,
    error?.code,
  );
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readConversationType(value: unknown): ConversationType {
  return value === 'group' ? 'group' : 'direct';
}

function readConversationRole(value: unknown): ConversationRole {
  return value === 'owner' || value === 'admin' ? value : 'member';
}

function readMessageType(value: unknown): MessageType {
  return value === 'image' || value === 'image_text' ? value : 'text';
}

function mapPeer(row: Record<string, unknown>): MessagePeer | null {
  const id = readString(row.peer_id ?? row.id);
  if (!id) return null;
  const username = readString(row.peer_username ?? row.username);
  return {
    id,
    displayName: readString(row.peer_display_name ?? row.display_name) ?? username ?? 'FCN-fan',
    username,
    avatarUrl: readString(row.peer_avatar_url ?? row.avatar_url),
  };
}

export function mapDirectMessageRow(row: Record<string, unknown>): ConversationMessage {
  const username = readString(row.sender_username);
  return {
    id: String(row.id ?? row.message_id ?? ''),
    conversationId: String(row.conversation_id ?? ''),
    senderId: String(row.sender_id ?? ''),
    senderDisplayName:
      readString(row.sender_display_name) ?? username ?? readString(row.sender_id) ?? 'FCN-fan',
    senderUsername: username,
    senderAvatarUrl: readString(row.sender_avatar_url),
    clientMessageId: String(row.client_message_id ?? ''),
    body: readString(row.body),
    type: readMessageType(row.message_type),
    mediaPath: readString(row.media_path),
    mediaUrl: readString(row.media_url),
    mediaMimeType: readString(row.media_mime_type),
    mediaWidth: row.media_width == null ? null : Number(row.media_width),
    mediaHeight: row.media_height == null ? null : Number(row.media_height),
    mediaSizeBytes: row.media_size_bytes == null ? null : Number(row.media_size_bytes),
    createdAt: String(row.created_at ?? ''),
    deletedAt: readString(row.deleted_at),
  };
}

function mapConversationDetails(row: Record<string, unknown>): ConversationDetails {
  const type = readConversationType(row.conversation_type);
  return {
    id: String(row.conversation_id ?? ''),
    type,
    name: readString(row.conversation_name),
    avatarPath: readString(row.conversation_avatar_path),
    avatarUrl: null,
    peer: mapPeer(row),
    lastMessageAt: readString(row.last_message_at),
    blocked: type === 'direct' && Boolean(row.blocked),
    blockedByMe: type === 'direct' && Boolean(row.blocked_by_me),
    memberCount: Number(row.member_count ?? (type === 'direct' ? 2 : 0)),
    currentUserRole: readConversationRole(row.current_user_role),
    peerLastReadAt: readString(row.peer_last_read_at),
    peerLastReadMessageId: readString(row.peer_last_read_message_id),
  };
}

async function hydrateMessageMedia(message: ConversationMessage): Promise<ConversationMessage> {
  if (!message.mediaPath) return message;
  return { ...message, mediaUrl: await signMessageImage(message.mediaPath) };
}

export function createDirectMessageClientId(): string {
  return Crypto.randomUUID();
}

export async function createOrGetDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_or_get_direct_conversation', {
    p_other_user_id: otherUserId,
  });
  if (error || !readString(data)) {
    throwFriendlyError(error, 'Samtalen kunne ikke startes. Prøv igen.');
  }
  return String(data);
}

export async function createGroupConversation(
  name: string,
  memberUserIds: string[],
): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_conversation', {
    p_name: name.trim(),
    p_member_user_ids: Array.from(new Set(memberUserIds)),
  });
  if (error || !readString(data)) {
    throwFriendlyError(error, 'Gruppen kunne ikke oprettes. Prøv igen.');
  }
  return String(data);
}

export async function getConversationDetails(
  conversationId: string,
): Promise<ConversationDetails | null> {
  const { data, error } = await supabase
    .rpc('get_conversation_details', { p_conversation_id: conversationId })
    .maybeSingle();
  if (error) throwFriendlyError(error, 'Samtalen kunne ikke hentes.');
  return data ? mapConversationDetails(data as Record<string, unknown>) : null;
}

export const getDirectConversationDetails = getConversationDetails;

export async function getMessagesInbox(
  cursor?: InboxCursor | null,
): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('get_messages_inbox', {
    p_before_activity_at: cursor?.activityAt ?? null,
    p_before_conversation_id: cursor?.conversationId ?? null,
    p_limit: 30,
  });
  if (error) throwFriendlyError(error, 'Beskederne kunne ikke hentes.');
  return ((data ?? []) as Record<string, unknown>[]).map(mapConversationInboxRow);
}

export const getDirectMessagesInbox = getMessagesInbox;

export async function getConversationMessages(
  conversationId: string,
  cursor?: MessageCursor | null,
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase.rpc('get_conversation_messages', {
    p_conversation_id: conversationId,
    p_before_created_at: cursor?.createdAt ?? null,
    p_before_message_id: cursor?.messageId ?? null,
    p_limit: 30,
  });
  if (error) throwFriendlyError(error, 'Samtalen kunne ikke hentes.');
  return Promise.all(
    ((data ?? []) as Record<string, unknown>[]).map((row) =>
      hydrateMessageMedia(mapDirectMessageRow(row)),
    ),
  );
}

export const getDirectMessages = getConversationMessages;

async function triggerMessagePush(messageId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('push_direct_message', {
    body: { messageId },
  });
  if (error || data?.ok !== true) {
    throw error ?? new Error(data?.error ?? 'Message push was not accepted');
  }
}

export async function sendMessage(params: {
  conversationId: string;
  body: string;
  clientMessageId: string;
  media?: MessageMediaUpload | null;
}): Promise<SendMessageResult> {
  const body = params.body.trim();
  const messageType: MessageType = params.media ? (body ? 'image_text' : 'image') : 'text';
  const { data, error } = await supabase
    .rpc('send_message', {
      p_conversation_id: params.conversationId,
      p_body: body || null,
      p_client_message_id: params.clientMessageId,
      p_message_type: messageType,
      p_media_path: params.media?.path ?? null,
      p_media_mime_type: params.media?.mimeType ?? null,
      p_media_width: params.media?.width ?? null,
      p_media_height: params.media?.height ?? null,
      p_media_size_bytes: params.media?.sizeBytes ?? null,
    })
    .single();
  if (error || !data) throwFriendlyError(error, 'Beskeden kunne ikke sendes. Prøv igen.');

  const row = data as Record<string, unknown>;
  const message = await hydrateMessageMedia(
    mapDirectMessageRow({ ...row, id: row.message_id, client_message_id: params.clientMessageId }),
  );
  const notificationJobIds = Array.isArray(row.notification_job_ids)
    ? row.notification_job_ids.filter((value): value is string => typeof value === 'string')
    : [];

  if (row.inserted && notificationJobIds.length > 0) {
    void triggerMessagePush(message.id).catch((pushError) => {
      logger.warn('[messagesApi] Durable message jobs were left for queue retry', {
        messageId: message.id,
        error: pushError instanceof Error ? pushError.message : String(pushError),
      });
    });
  }

  return {
    message,
    notificationJobIds,
    notificationJobId: notificationJobIds[0] ?? null,
    inserted: Boolean(row.inserted),
  };
}

export function sendDirectMessage(params: {
  conversationId: string;
  body: string;
  clientMessageId: string;
}): Promise<SendMessageResult> {
  return sendMessage(params);
}

export async function markConversationRead(
  conversationId: string,
  lastLoadedMessageId: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
    p_last_loaded_message_id: lastLoadedMessageId,
  });
  if (error) throw new DirectMessageServiceError('Læsestatus kunne ikke opdateres.', error.code);
}

export const markDirectConversationRead = markConversationRead;

export async function getDirectMessageUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_direct_message_unread_count');
  if (error) {
    logger.warn('[messagesApi] Unread count failed', { code: error.code });
    return 0;
  }
  return Number(data ?? 0);
}

export async function searchDirectMessageUsers(query: string): Promise<MessageUserSearchResult[]> {
  if (query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('search_direct_message_users', {
    p_query: query,
    p_limit: 20,
  });
  if (error) throw new DirectMessageServiceError('Brugersøgningen fejlede. Prøv igen.', error.code);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(mapPeer(row) as MessagePeer),
    fanLevelKey: readString(row.fan_level_key),
    mutualCommunityCount: Number(row.mutual_community_count ?? 0),
  }));
}

export async function getGroupMembers(conversationId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase.rpc('get_group_members', {
    p_conversation_id: conversationId,
  });
  if (error) throwFriendlyError(error, 'Medlemmerne kunne ikke hentes.');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.user_id ?? ''),
    displayName: readString(row.display_name) ?? readString(row.username) ?? 'FCN-fan',
    username: readString(row.username),
    avatarUrl: readString(row.avatar_url),
    role: readConversationRole(row.role),
    joinedAt: String(row.joined_at ?? ''),
  }));
}

export async function addGroupMembers(conversationId: string, userIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('add_group_members', {
    p_conversation_id: conversationId,
    p_member_user_ids: Array.from(new Set(userIds)),
  });
  if (error) throwFriendlyError(error, 'Medlemmerne kunne ikke tilføjes.');
  return Number(data ?? 0);
}

export async function removeGroupMember(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_group_member', {
    p_conversation_id: conversationId,
    p_member_user_id: userId,
  });
  if (error) throwFriendlyError(error, 'Medlemmet kunne ikke fjernes.');
}

export async function leaveGroup(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_group', { p_conversation_id: conversationId });
  if (error) throwFriendlyError(error, 'Du kunne ikke forlade gruppen.');
}

export async function updateGroupMetadata(conversationId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('update_group_metadata', {
    p_conversation_id: conversationId,
    p_name: name.trim(),
    p_avatar_path: null,
    p_clear_avatar: false,
  });
  if (error) throwFriendlyError(error, 'Gruppen kunne ikke opdateres.');
}

export async function updateGroupMemberRole(
  conversationId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  const { error } = await supabase.rpc('update_group_member_role', {
    p_conversation_id: conversationId,
    p_member_user_id: userId,
    p_role: role,
  });
  if (error) throwFriendlyError(error, 'Rollen kunne ikke opdateres.');
}

export async function getDirectMessageBlockStatus(otherUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_direct_message_block_status', {
    p_other_user_id: otherUserId,
  });
  if (error) {
    logger.warn('[messagesApi] Block status failed', { code: error.code });
    return false;
  }
  return Boolean(data);
}

export async function blockDirectMessageUser(otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('set_direct_message_block', {
    p_other_user_id: otherUserId,
    p_blocked: true,
  });
  if (error) throw new DirectMessageServiceError('Brugeren kunne ikke blokeres.', error.code);
}

export async function unblockDirectMessageUser(otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('set_direct_message_block', {
    p_other_user_id: otherUserId,
    p_blocked: false,
  });
  if (error) throw new DirectMessageServiceError('Blokeringen kunne ikke fjernes.', error.code);
}

export async function reportConversation(params: {
  conversationId: string;
  targetType: 'user' | 'conversation';
  reportedUserId?: string | null;
  reason: DirectMessageReportReason;
  note?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('report_conversation', {
    p_conversation_id: params.conversationId,
    p_report_target_type: params.targetType,
    p_reported_user_id: params.reportedUserId ?? null,
    p_reason: params.reason,
    p_note: params.note?.trim() || null,
  });
  if (error || !readString(data)) {
    throw new DirectMessageServiceError('Rapporten kunne ikke sendes.', error?.code);
  }
  return String(data);
}

export function reportDirectMessage(params: {
  conversationId: string;
  reportedUserId: string;
  reason: DirectMessageReportReason;
  note?: string | null;
}): Promise<string> {
  return reportConversation({ ...params, targetType: 'user' });
}
