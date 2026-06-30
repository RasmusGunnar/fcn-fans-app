import type { PickedMedia } from '../lib/mediaPicker';
import type { DiscussionPost } from '../types/discussion';

export const DISCUSSION_MAX_IMAGES = 4;
export const DISCUSSION_MAX_VIDEOS = 1;
export const DISCUSSION_MAX_VIDEO_SECONDS = 60;
export const DISCUSSION_MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const DISCUSSION_EDIT_WINDOW_MS = 15 * 60 * 1000;

const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/i;
const URL_GLOBAL_REGEX = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION_REGEX = /[),.;!?]+$/;

export type DiscussionTextSegment =
  | { type: 'text'; text: string }
  | { type: 'url'; text: string; url: string };

export function extractPrimaryUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  if (!match?.[0]) return null;

  try {
    const url = new URL(match[0].replace(TRAILING_URL_PUNCTUATION_REGEX, ''));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function splitDiscussionTextByUrls(text: string): DiscussionTextSegment[] {
  const segments: DiscussionTextSegment[] = [];
  const matches = Array.from(text.matchAll(URL_GLOBAL_REGEX));
  let lastIndex = 0;

  for (const match of matches) {
    const rawMatch = match[0];
    const index = match.index ?? 0;
    const candidate = rawMatch.replace(TRAILING_URL_PUNCTUATION_REGEX, '');
    const trailing = rawMatch.slice(candidate.length);

    if (!candidate) continue;

    let normalizedUrl: string;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        continue;
      }
      normalizedUrl = url.toString();
    } catch {
      continue;
    }

    if (index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, index) });
    }

    segments.push({ type: 'url', text: candidate, url: normalizedUrl });
    if (trailing) {
      segments.push({ type: 'text', text: trailing });
    }

    lastIndex = index + rawMatch.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', text }];
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
