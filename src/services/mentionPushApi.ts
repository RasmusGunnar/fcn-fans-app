import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

export type MentionPushPayload = {
  actorUserId: string;
  mentionedUserIds: string[];
  entityType: 'post' | 'comment' | 'reply';
  entityId: string;
  postId?: string | null;
  commentId?: string | null;
  previewText?: string | null;
};

export async function triggerMentionPush(payload: MentionPushPayload): Promise<boolean> {
  if (payload.mentionedUserIds.length === 0) {
    return false;
  }

  try {
    const { data, error } = await supabase.functions.invoke('push_mentions', {
      body: payload,
    });

    if (error) {
      logger.warn('[mentionPushApi] triggerMentionPush failed:', error);
      return false;
    }

    if (data?.ok !== true) {
      logger.warn('[mentionPushApi] triggerMentionPush returned non-ok payload:', data);
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('[mentionPushApi] triggerMentionPush threw:', error);
    return false;
  }
}
