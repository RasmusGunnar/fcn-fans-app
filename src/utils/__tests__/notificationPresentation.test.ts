import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  formatNotificationUnreadBadge,
  getNotificationBellAccessibilityLabel,
  getNotificationInteractionKind,
  getNotificationLabel,
  type NotificationPresentationItem,
} from '../notificationPresentation';

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function makeNotification(
  override: Partial<NotificationPresentationItem>,
): NotificationPresentationItem {
  return {
    type: 'reply',
    entity_type: 'comment',
    ...override,
  };
}

test('comment_on_post copy names the sender when available', () => {
  const item = makeNotification({
    actor_display_name: 'Mads',
    reply_comment_parent_id: null,
  });

  assert.equal(getNotificationInteractionKind(item), 'comment_on_post');
  assert.equal(getNotificationLabel(item), 'Mads kommenterede på dit opslag');
});

test('comment_on_post copy falls back without a sender name', () => {
  const item = makeNotification({
    actor_display_name: '   ',
    reply_comment_parent_id: null,
  });

  assert.equal(getNotificationLabel(item), 'Nogen kommenterede på dit opslag');
});

test('reply_to_comment keeps the existing reply copy', () => {
  const item = makeNotification({
    actor_display_name: 'Mads',
    reply_comment_parent_id: 'parent-comment-id',
  });

  assert.equal(getNotificationInteractionKind(item), 'reply_to_comment');
  assert.equal(getNotificationLabel(item), 'Nogen svarede på din kommentar');
});

test('mentions keep existing copy', () => {
  assert.equal(
    getNotificationLabel(makeNotification({ type: 'mention', entity_type: 'post' })),
    'Du blev nævnt i et opslag',
  );
  assert.equal(
    getNotificationLabel(makeNotification({ type: 'mention', entity_type: 'comment' })),
    'Du blev nævnt i en kommentar',
  );
});

test('v2 notification center rows use their stored title', () => {
  assert.equal(
    getNotificationLabel(
      makeNotification({
        type: 'match_highfive',
        entity_type: 'match',
        title: 'Highfive på kampdagen',
      }),
    ),
    'Highfive på kampdagen',
  );
});

test('notification bell badge hides zero and caps display at 99+', () => {
  assert.equal(formatNotificationUnreadBadge(0), null);
  assert.equal(formatNotificationUnreadBadge(1), '1');
  assert.equal(formatNotificationUnreadBadge(99), '99');
  assert.equal(formatNotificationUnreadBadge(100), '99+');
});

test('notification bell accessibility includes the authoritative unread count', () => {
  assert.equal(getNotificationBellAccessibilityLabel(0), 'Notifikationer, ingen ul\u00e6ste');
  assert.equal(getNotificationBellAccessibilityLabel(1), 'Notifikationer, 1 ul\u00e6st');
  assert.equal(getNotificationBellAccessibilityLabel(12), 'Notifikationer, 12 ul\u00e6ste');
});

test('push lifecycle config keeps Android sound and v2 token revocation wired', () => {
  const notificationSource = readWorkspaceFile('src/lib/notifications.ts');
  const notificationApiSource = readWorkspaceFile('src/services/notificationsApi.ts');
  const claimSource = readWorkspaceFile('supabase/functions/claim_push_token/index.ts');
  const queueSource = readWorkspaceFile('supabase/functions/process_push_queue/index.ts');
  const receiptSource = readWorkspaceFile('supabase/functions/poll_push_receipts/index.ts');

  assert.match(
    notificationSource,
    /setNotificationChannelAsync\('default',[\s\S]*sound: 'default'/,
  );
  assert.match(notificationSource, /action: 'revoke'/);
  assert.match(notificationApiSource, /App icon badge update failed[\s\S]*return unreadCount;/);
  assert.match(claimSource, /invalidated_reason: 'signed_out'/);
  assert.match(claimSource, /throw error;/);
  assert.match(queueSource, /from\('push_tokens'\)[\s\S]*delete\(\)/);
  assert.match(receiptSource, /push_token_snapshot[\s\S]*from\('push_tokens'\)/);
});
