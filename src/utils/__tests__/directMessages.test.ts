import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { DirectMessage } from '../../types/messages';
import {
  canSubmitDirectMessage,
  createOrReuseDirectMessageSendAttempt,
  formatMessageUnreadBadge,
  getDirectMessageNotificationConversationId,
  getMessageInboxAccessibilityLabel,
  mapDirectMessageInboxRow,
  mergeDirectMessages,
  parseDirectMessageDeepLink,
  sanitizeDirectMessagePreview,
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
    clientMessageId: `33333333-3333-4333-8333-${id.padStart(12, '0')}`,
    body: `Besked ${id}`,
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
  assert.equal(result.peer.displayName, 'Freja');
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
    /markDirectConversationRead\(conversationId, latestLoadedMessage\.id\)/,
  );
  assert.match(
    navigationSource,
    /targetType === 'direct_message'[\s\S]*navigateToDirectMessageConversation/,
  );
  assert.match(queueSource, /getDirectMessageSkipReason[\s\S]*direct_message_blocked/);
});
