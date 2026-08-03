import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNotificationInteractionKind,
  getNotificationLabel,
  type NotificationPresentationItem,
} from '../notificationPresentation';

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
