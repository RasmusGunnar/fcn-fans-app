import { targetKey } from './targetKey';

export const POST_ENGAGEMENT_TARGET_TYPE = 'post' as const;

export function getPostEngagementIdentity(postId: string) {
  return {
    targetType: POST_ENGAGEMENT_TARGET_TYPE,
    targetId: postId,
    key: targetKey(POST_ENGAGEMENT_TARGET_TYPE, postId),
  };
}
