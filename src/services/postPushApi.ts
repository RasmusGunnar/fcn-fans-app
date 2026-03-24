import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export async function triggerCommunityPostPush(postId: string): Promise<boolean> {
  const normalizedPostId = postId.trim();
  if (!normalizedPostId) return false;

  try {
    const { data, error } = await supabase.functions.invoke('push_community_posts', {
      body: { postId: normalizedPostId },
    });

    if (error) {
      logger.warn('[postPushApi] triggerCommunityPostPush failed:', error);
      return false;
    }

    if (data?.ok !== true) {
      logger.warn('[postPushApi] triggerCommunityPostPush returned non-ok payload:', data);
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('[postPushApi] triggerCommunityPostPush threw:', error);
    return false;
  }
}
