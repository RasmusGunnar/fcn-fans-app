import { createNotification } from './notificationsApi';
import { resolveProfileIdByUsername } from './postEntities';

type CreateMentionNotificationsInput = {
  mentionedUsernames: string[];
  actorId: string;
  postId: string;
  commentId?: string;
  entityType?: 'post' | 'comment';
  entityId?: string;
};

export async function createMentionNotifications({
  mentionedUsernames,
  actorId,
  postId,
  commentId,
  entityType = 'comment',
  entityId,
}: CreateMentionNotificationsInput) {
  const uniqueUsernames = Array.from(
    new Set(
      mentionedUsernames
        .map((username) => username.trim().replace(/^@+/, '').toLowerCase())
        .filter((username) => username.length > 0),
    ),
  );

  for (const username of uniqueUsernames) {
    const userId = await resolveProfileIdByUsername(username);
    if (!userId || userId === actorId) continue;

    await createNotification({
      user_id: userId,
      actor_id: actorId,
      type: 'mention',
      entity_type: entityType,
      entity_id: entityId ?? commentId ?? postId,
      post_id: postId,
    });
  }
}
