import type { LinkPreview } from '../types/news';
import type { Post } from '../types/post';

export type PostComposerActor = {
  type: 'user' | 'community';
  id: string;
};

type BuildPostInsertPayloadOptions = {
  media?: Post['media'];
  linkPreview?: LinkPreview | null;
};

export function resolvePostFeedTargets(feedTargets?: string[]): string[] {
  return Array.isArray(feedTargets) && feedTargets.length > 0 ? feedTargets : ['home'];
}

export function buildPostInsertPayload(
  userId: string,
  text: string,
  actor: PostComposerActor | undefined,
  feedTargets: string[] | undefined,
  options: BuildPostInsertPayloadOptions = {},
) {
  const media = Array.isArray(options.media) ? options.media : [];
  const resolvedActorType = actor?.type ?? 'user';
  const resolvedActorId = actor?.type === 'community' ? actor.id : userId;

  return {
    author_id: userId,
    actor_type: resolvedActorType,
    actor_id: resolvedActorId,
    feed_targets: resolvePostFeedTargets(feedTargets),
    text: text.trim(),
    media,
    ...(media.length > 0 ? { media_type: media[0]?.type ?? 'image' } : {}),
    ...(options.linkPreview ? { link_preview: options.linkPreview } : {}),
    ...(actor?.type === 'community' ? { community_id: actor.id } : {}),
  };
}

export function shouldSyncPostToHome(feedTargets: string[]): boolean {
  return feedTargets.includes('home');
}
