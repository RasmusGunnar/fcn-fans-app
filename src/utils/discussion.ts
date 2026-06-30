import type { PickedMedia } from '../lib/mediaPicker';
import type { DiscussionPost } from '../types/discussion';

export const DISCUSSION_MAX_IMAGES = 4;
export const DISCUSSION_MAX_VIDEOS = 1;
export const DISCUSSION_MAX_VIDEO_SECONDS = 60;
export const DISCUSSION_MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const DISCUSSION_EDIT_WINDOW_MS = 15 * 60 * 1000;

const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/i;

export function extractPrimaryUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  if (!match?.[0]) return null;

  try {
    const url = new URL(match[0].replace(/[),.;!?]+$/, ''));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function canEditDiscussionPost(
  post: Pick<DiscussionPost, 'authorId' | 'createdAt' | 'hiddenAt' | 'deletedAt'>,
  userId?: string | null,
): boolean {
  if (!userId || post.authorId !== userId || post.hiddenAt || post.deletedAt) {
    return false;
  }

  const createdAt = new Date(post.createdAt).getTime();
  return Number.isFinite(createdAt) && Date.now() - createdAt <= DISCUSSION_EDIT_WINDOW_MS;
}

export function validateDiscussionMediaSelection(media: PickedMedia[]): string | null {
  const images = media.filter((item) => item.type === 'image');
  const videos = media.filter((item) => item.type === 'video');

  if (images.length > 0 && videos.length > 0) {
    return 'Vælg enten billeder eller én video.';
  }

  if (images.length > DISCUSSION_MAX_IMAGES) {
    return `Du kan højest vedhæfte ${DISCUSSION_MAX_IMAGES} billeder.`;
  }

  if (videos.length > DISCUSSION_MAX_VIDEOS) {
    return 'Du kan kun vedhæfte én video.';
  }

  const longVideo = videos.find((video) => {
    if (!video.duration) return false;
    return video.duration / 1000 > DISCUSSION_MAX_VIDEO_SECONDS;
  });

  if (longVideo) {
    return `Videoen må højest være ${DISCUSSION_MAX_VIDEO_SECONDS} sekunder.`;
  }

  return null;
}

export function groupDiscussionReplies(posts: DiscussionPost[]): DiscussionPost[] {
  const byId = new Map<string, DiscussionPost>();
  const roots: DiscussionPost[] = [];

  for (const post of posts) {
    byId.set(post.id, { ...post, replies: [] });
  }

  for (const post of byId.values()) {
    if (post.parentPostId && byId.has(post.parentPostId)) {
      byId.get(post.parentPostId)?.replies.push(post);
    } else {
      roots.push(post);
    }
  }

  const sortByCreatedAt = (a: DiscussionPost, b: DiscussionPost) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

  roots.sort(sortByCreatedAt);
  for (const root of roots) {
    root.replies.sort(sortByCreatedAt);
  }

  return roots;
}
