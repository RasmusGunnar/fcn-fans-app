import * as Crypto from 'expo-crypto';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import type {
  ConversationDetails,
  ConversationSummary,
  DirectMessage,
  DirectMessageReportReason,
  InboxCursor,
  MessageCursor,
  MessagePeer,
  MessageUserSearchResult,
  SendMessageResult,
} from '../types/messages';
import { getDirectMessageErrorMessage, mapDirectMessageInboxRow } from '../utils/directMessages';

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

function mapPeer(row: Record<string, unknown>): MessagePeer {
  const id = readString(row.peer_id ?? row.id) ?? '';
  const username = readString(row.peer_username ?? row.username);
  return {
    id,
    displayName: readString(row.peer_display_name ?? row.display_name) ?? username ?? 'FCN-fan',
    username,
    avatarUrl: readString(row.peer_avatar_url ?? row.avatar_url),
  };
}

export function mapDirectMessageRow(row: Record<string, unknown>): DirectMessage {
  return {
    id: String(row.id ?? row.message_id ?? ''),
    conversationId: String(row.conversation_id ?? ''),
    senderId: String(row.sender_id ?? ''),
    clientMessageId: String(row.client_message_id ?? ''),
    body: String(row.body ?? ''),
    createdAt: String(row.created_at ?? ''),
    deletedAt: readString(row.deleted_at),
  };
}

function mapConversationDetails(row: Record<string, unknown>): ConversationDetails {
  return {
    id: String(row.conversation_id ?? ''),
    peer: mapPeer(row),
    lastMessageAt: readString(row.last_message_at),
    blocked: Boolean(row.blocked),
    blockedByMe: Boolean(row.blocked_by_me),
  };
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

export async function getDirectConversationDetails(
  conversationId: string,
): Promise<ConversationDetails | null> {
  const { data, error } = await supabase
    .rpc('get_direct_conversation_details', { p_conversation_id: conversationId })
    .maybeSingle();
  if (error) {
    throwFriendlyError(error, 'Samtalen kunne ikke hentes.');
  }
  return data ? mapConversationDetails(data as Record<string, unknown>) : null;
}

export async function getDirectMessagesInbox(
  cursor?: InboxCursor | null,
): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('get_direct_messages_inbox', {
    p_before_last_message_at: cursor?.lastMessageAt ?? null,
    p_before_conversation_id: cursor?.conversationId ?? null,
    p_limit: 30,
  });
  if (error) {
    throwFriendlyError(error, 'Beskederne kunne ikke hentes.');
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map(mapDirectMessageInboxRow);
}

export async function getDirectMessages(
  conversationId: string,
  cursor?: MessageCursor | null,
): Promise<DirectMessage[]> {
  const { data, error } = await supabase.rpc('get_direct_messages', {
    p_conversation_id: conversationId,
    p_before_created_at: cursor?.createdAt ?? null,
    p_before_message_id: cursor?.messageId ?? null,
    p_limit: 30,
  });
  if (error) {
    throwFriendlyError(error, 'Samtalen kunne ikke hentes.');
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapDirectMessageRow);
}

async function triggerDirectMessagePush(messageId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('push_direct_message', {
    body: { messageId },
  });
  if (error || data?.ok !== true) {
    throw error ?? new Error(data?.error ?? 'Direct message push was not accepted');
  }
}

export async function sendDirectMessage(params: {
  conversationId: string;
  body: string;
  clientMessageId: string;
}): Promise<SendMessageResult> {
  const { data, error } = await supabase
    .rpc('send_direct_message', {
      p_conversation_id: params.conversationId,
      p_body: params.body,
      p_client_message_id: params.clientMessageId,
    })
    .single();
  if (error || !data) {
    throwFriendlyError(error, 'Beskeden kunne ikke sendes. Prøv igen.');
  }

  const resultRow = data as Record<string, unknown>;
  const message = mapDirectMessageRow({
    ...resultRow,
    id: resultRow.message_id,
    client_message_id: params.clientMessageId,
  });

  if (resultRow.inserted && resultRow.notification_job_id) {
    void triggerDirectMessagePush(message.id).catch((pushError) => {
      logger.warn('[messagesApi] Durable DM job was left for queue retry', {
        messageId: message.id,
        error: pushError instanceof Error ? pushError.message : String(pushError),
      });
    });
  }

  return {
    message,
    notificationJobId: readString(resultRow.notification_job_id),
    inserted: Boolean(resultRow.inserted),
  };
}

export async function markDirectConversationRead(
  conversationId: string,
  lastLoadedMessageId: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_direct_conversation_read', {
    p_conversation_id: conversationId,
    p_last_loaded_message_id: lastLoadedMessageId,
  });
  if (error) {
    throw new DirectMessageServiceError('Læsestatus kunne ikke opdateres.', error.code);
  }
}

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
  if (error) {
    throw new DirectMessageServiceError('Brugersøgningen fejlede. Prøv igen.', error.code);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...mapPeer(row),
    fanLevelKey: readString(row.fan_level_key),
    mutualCommunityCount: Number(row.mutual_community_count ?? 0),
  }));
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
  if (error) {
    throw new DirectMessageServiceError('Brugeren kunne ikke blokeres.', error.code);
  }
}

export async function unblockDirectMessageUser(otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('set_direct_message_block', {
    p_other_user_id: otherUserId,
    p_blocked: false,
  });
  if (error) {
    throw new DirectMessageServiceError('Blokeringen kunne ikke fjernes.', error.code);
  }
}

export async function reportDirectMessage(params: {
  conversationId: string;
  reportedUserId: string;
  reason: DirectMessageReportReason;
  note?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('report_direct_message', {
    p_conversation_id: params.conversationId,
    p_reported_user_id: params.reportedUserId,
    p_reason: params.reason,
    p_note: params.note?.trim() || null,
  });
  if (error || !readString(data)) {
    throw new DirectMessageServiceError('Rapporten kunne ikke sendes.', error?.code);
  }
  return String(data);
}
