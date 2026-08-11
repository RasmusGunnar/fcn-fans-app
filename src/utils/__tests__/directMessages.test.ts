import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { DirectMessage } from '../../types/messages';
import {
  canSubmitDirectMessage,
  createOrReuseDirectMessageSendAttempt,
  formatMessageDateSeparator,
  formatMessageUnreadBadge,
  getConversationPreview,
  getConversationTitle,
  getDirectMessageNotificationConversationId,
  getMessageInboxAccessibilityLabel,
  getTypingLabel,
  isLatestOwnDirectMessageSeen,
  mapConversationInboxRow,
  mapDirectMessageInboxRow,
  mergeDirectMessages,
  parseDirectMessageDeepLink,
  sanitizeDirectMessagePreview,
  updateTypingUsers,
  validateGroupCreation,
} from '../directMessages';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function message(id: string, createdAt: string): DirectMessage {
  return {
    id,
    conversationId: CONVERSATION_ID,
    senderId: '22222222-2222-4222-8222-222222222222',
    senderDisplayName: 'Freja',
    senderUsername: 'freja',
    senderAvatarUrl: null,
    clientMessageId: `33333333-3333-4333-8333-${id.padStart(12, '0')}`,
    body: `Besked ${id}`,
    type: 'text',
    mediaPath: null,
    mediaUrl: null,
    mediaMimeType: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaSizeBytes: null,
    externalShare: null,
    createdAt,
    deletedAt: null,
  };
}

test('maps the allowlisted inbox RPC row to the app model', () => {
  const result = mapDirectMessageInboxRow({
    conversation_id: CONVERSATION_ID,
    peer_id: '22222222-2222-4222-8222-222222222222',
    peer_display_name: 'Freja',
    peer_username: 'freja',
    peer_avatar_url: 'https://example.test/avatar.jpg',
    last_message_id: '44444444-4444-4444-8444-444444444444',
    last_message_body: 'Hej fra Farum',
    last_message_sender_id: '22222222-2222-4222-8222-222222222222',
    last_message_at: '2026-08-07T10:00:00.000Z',
    unread_count: 2,
    blocked: false,
    blocked_by_me: false,
  });

  assert.equal(result.id, CONVERSATION_ID);
  assert.equal(result.peer?.displayName, 'Freja');
  assert.equal(result.lastMessageBody, 'Hej fra Farum');
  assert.equal(result.unreadCount, 2);
});

test('message badge hides zero and caps values above 99', () => {
  assert.equal(formatMessageUnreadBadge(0), null);
  assert.equal(formatMessageUnreadBadge(1), '1');
  assert.equal(formatMessageUnreadBadge(99), '99');
  assert.equal(formatMessageUnreadBadge(100), '99+');
  assert.equal(getMessageInboxAccessibilityLabel(0), 'Beskeder, ingen ulæste');
  assert.equal(getMessageInboxAccessibilityLabel(2), 'Beskeder, 2 ulæste');
});

test('send retry reuses the same client message id for unchanged content', () => {
  let generated = 0;
  const createId = () => `client-${++generated}`;
  const initial = createOrReuseDirectMessageSendAttempt('  Kom så FCN  ', null, createId);
  const retry = createOrReuseDirectMessageSendAttempt('Kom så FCN', initial, createId);
  const changed = createOrReuseDirectMessageSendAttempt('Ny besked', initial, createId);

  assert.deepEqual(initial, { body: 'Kom så FCN', clientMessageId: 'client-1' });
  assert.equal(retry, initial);
  assert.equal(changed?.clientMessageId, 'client-2');
});

test('realtime merge deduplicates by server id and keeps newest first', () => {
  const older = message('1', '2026-08-07T10:00:00.000Z');
  const newer = message('2', '2026-08-07T10:01:00.000Z');
  assert.deepEqual(
    mergeDirectMessages([older], [older, newer]).map((item) => item.id),
    ['2', '1'],
  );
});

test('blocked or empty composers cannot submit', () => {
  assert.equal(canSubmitDirectMessage({ body: 'Hej', blocked: true, sending: false }), false);
  assert.equal(canSubmitDirectMessage({ body: '   ', blocked: false, sending: false }), false);
  assert.equal(canSubmitDirectMessage({ body: 'Hej', blocked: false, sending: true }), false);
  assert.equal(canSubmitDirectMessage({ body: 'Hej', blocked: false, sending: false }), true);
});

test('direct-message deep links and push payloads resolve the conversation', () => {
  assert.equal(
    parseDirectMessageDeepLink(`fcnfans://messages/${CONVERSATION_ID}`),
    CONVERSATION_ID,
  );
  assert.equal(parseDirectMessageDeepLink(`messages/${CONVERSATION_ID}`), CONVERSATION_ID);
  assert.equal(
    getDirectMessageNotificationConversationId({
      targetType: 'direct_message',
      conversationId: CONVERSATION_ID,
    }),
    CONVERSATION_ID,
  );
  assert.equal(
    getDirectMessageNotificationConversationId({
      targetType: 'event',
      conversationId: CONVERSATION_ID,
    }),
    null,
  );
});

test('push preview normalizes whitespace, truncates, and has a fallback', () => {
  assert.equal(sanitizeDirectMessagePreview('  Kom\n\n så   FCN  '), 'Kom så FCN');
  assert.equal(sanitizeDirectMessagePreview('   '), 'Du har fået en ny besked');
  assert.equal(sanitizeDirectMessagePreview('1234567890', 5), '12345');
});

test('provider and navigation sources keep account reset and DM routing wired', () => {
  const providerSource = readWorkspaceFile('src/state/MessageUnreadContext.tsx');
  const bootstrapSource = readWorkspaceFile('src/components/PushNotificationsBootstrap.tsx');
  const conversationSource = readWorkspaceFile('src/screens/ConversationScreen.tsx');
  const navigationSource = readWorkspaceFile('src/navigation/navigationRef.ts');
  const queueSource = readWorkspaceFile('supabase/functions/process_push_queue/index.ts');

  assert.match(providerSource, /activeUserIdRef\.current = user\?\.id \?\? null/);
  assert.match(providerSource, /if \(!user\?\.id\) \{[\s\S]*publishUnreadCount\(0\)/);
  assert.match(bootstrapSource, /refreshMessageUnreadCount/);
  assert.match(conversationSource, /Du kan ikke sende beskeder i denne samtale\./);
  assert.match(
    conversationSource,
    /markConversationRead\(conversationId, latestLoadedMessage\.id\)/,
  );
  assert.match(
    navigationSource,
    /targetType === 'direct_message'[\s\S]*navigateToDirectMessageConversation/,
  );
  assert.match(queueSource, /getDirectMessageSkipReason[\s\S]*direct_message_blocked/);
});

test('maps direct and group inbox rows without assuming a peer', () => {
  const direct = mapConversationInboxRow({
    conversation_id: CONVERSATION_ID,
    conversation_type: 'direct',
    peer_id: '22222222-2222-4222-8222-222222222222',
    peer_display_name: 'Freja',
    last_message_id: '44444444-4444-4444-8444-444444444444',
    last_message_body: 'Hej',
    last_message_type: 'text',
    last_message_at: '2026-08-07T10:00:00.000Z',
    activity_at: '2026-08-07T10:00:00.000Z',
    member_count: 2,
  });
  const group = mapConversationInboxRow({
    conversation_id: CONVERSATION_ID,
    conversation_type: 'group',
    conversation_name: 'Udebaneturen',
    last_message_id: '44444444-4444-4444-8444-444444444444',
    last_message_type: 'image',
    last_message_sender_id: '22222222-2222-4222-8222-222222222222',
    last_message_sender_name: 'Freja',
    last_message_at: '2026-08-07T10:00:00.000Z',
    activity_at: '2026-08-07T10:00:00.000Z',
    member_count: 3,
    current_user_role: 'owner',
  });

  assert.equal(getConversationTitle(direct), 'Freja');
  assert.equal(group.peer, null);
  assert.equal(getConversationTitle(group), 'Udebaneturen');
  assert.equal(getConversationPreview(group, 'other-user'), 'Freja: 📷 Billede');
  assert.equal(group.memberCount, 3);
});

test('group creation requires a name and between one and nine other users', () => {
  assert.equal(validateGroupCreation('', ['a']), 'Gruppen skal have et navn på højst 80 tegn.');
  assert.equal(validateGroupCreation('Tur', []), 'Vælg mindst en anden fan.');
  assert.equal(
    validateGroupCreation(
      'Tur',
      Array.from({ length: 10 }, (_, index) => String(index)),
    ),
    'Du kan vælge højst 9 andre fans.',
  );
  assert.equal(validateGroupCreation('Tur', ['a', 'a']), null);
});

test('image messages can submit without text and image previews identify sender', () => {
  assert.equal(
    canSubmitDirectMessage({ body: '', hasImage: true, blocked: false, sending: false }),
    true,
  );
  assert.equal(
    getConversationPreview(
      {
        type: 'group',
        lastMessageBody: null,
        lastMessageType: 'image',
        lastMessageExternalShare: null,
        lastMessageSenderId: 'me',
        lastMessageSenderName: 'Rasmus',
      },
      'me',
    ),
    'Dig: 📷 Billede',
  );
});

test('external-link messages can submit without text and produce a safe inbox preview', () => {
  assert.equal(
    canSubmitDirectMessage({
      body: '',
      hasExternalShare: true,
      blocked: false,
      sending: false,
    }),
    true,
  );
  const conversation = mapConversationInboxRow({
    conversation_id: CONVERSATION_ID,
    conversation_type: 'direct',
    peer_id: '22222222-2222-4222-8222-222222222222',
    last_message_id: '44444444-4444-4444-8444-444444444444',
    last_message_type: 'external_link',
    last_message_external_share: {
      provider: 'instagram',
      canonical_url: 'https://www.instagram.com/reel/ABCDE_12/',
      display_url: 'https://www.instagram.com/reel/ABCDE_12/',
      resource_type: 'reel',
      external_id: 'ABCDE_12',
    },
    last_message_sender_id: '22222222-2222-4222-8222-222222222222',
    activity_at: '2026-08-11T12:00:00.000Z',
  });
  assert.equal(conversation.lastMessageExternalShare?.resourceType, 'reel');
  assert.equal(getConversationPreview(conversation, 'me'), 'Instagram-reel');
});

test('typing state ignores self, expires, and formats one or several users', () => {
  const first = updateTypingUsers(
    [],
    { userId: 'a', displayName: 'Freja', typing: true },
    'me',
    1000,
  );
  const ignored = updateTypingUsers(
    first,
    { userId: 'me', displayName: 'Mig', typing: true },
    'me',
    1000,
  );
  const second = updateTypingUsers(
    ignored,
    { userId: 'b', displayName: 'Maria', typing: true },
    'me',
    1000,
  );
  const expired = updateTypingUsers(
    second,
    { userId: 'b', displayName: 'Maria', typing: false },
    'me',
    5000,
  );
  assert.equal(ignored.length, 1);
  assert.equal(getTypingLabel(first), 'Freja skriver...');
  assert.equal(getTypingLabel(second), 'Freja og Maria skriver...');
  assert.equal(expired.length, 0);
});

test('seen is only true for the latest own direct message at or before peer read pointer', () => {
  const own = message('2', '2026-08-07T10:01:00.000Z');
  assert.equal(
    isLatestOwnDirectMessageSeen({
      message: own,
      latestOwnMessageId: own.id,
      peerLastReadAt: own.createdAt,
      peerLastReadMessageId: own.id,
    }),
    true,
  );
  assert.equal(
    isLatestOwnDirectMessageSeen({
      message: own,
      latestOwnMessageId: 'another',
      peerLastReadAt: own.createdAt,
      peerLastReadMessageId: own.id,
    }),
    false,
  );
});

test('date separators use today, yesterday, and a full date', () => {
  const now = new Date('2026-08-07T12:00:00.000Z');
  assert.equal(formatMessageDateSeparator('2026-08-07T10:00:00.000Z', now), 'I dag');
  assert.equal(formatMessageDateSeparator('2026-08-06T10:00:00.000Z', now), 'I går');
  assert.match(formatMessageDateSeparator('2026-08-01T10:00:00.000Z', now), /2026/);
});

test('V1.5 UI sources keep private media, typing, group info, and direct-only seen explicit', () => {
  const conversationSource = readWorkspaceFile('src/screens/ConversationScreen.tsx');
  const groupInfoSource = readWorkspaceFile('src/screens/GroupInfoScreen.tsx');
  const mediaSource = readWorkspaceFile('src/lib/messageMedia.ts');
  const typingSource = readWorkspaceFile('src/hooks/useConversationTyping.ts');
  const migrationSource = readWorkspaceFile(
    'supabase/migrations/20260807151000_add_message_media.sql',
  );

  assert.match(conversationSource, /details\?\.type === 'direct'[\s\S]*seen \? 'Set' : 'Sendt'/);
  assert.match(conversationSource, /details\?\.type === 'group' \? <TypingIndicator/);
  assert.match(groupInfoSource, /removeGroupMember/);
  assert.match(groupInfoSource, /updateGroupMemberRole/);
  assert.match(mediaSource, /MESSAGE_MEDIA_BUCKET = 'message-media'/);
  assert.match(typingSource, /config: \{ private: true \}/);
  assert.match(migrationSource, /public false|false,/);
  assert.match(migrationSource, /membership\.left_at is null/);
});
