import type { LinkPreview } from '../types/news';
import { assertValidPostSubtypePayload } from '../types/post';
import { normalizeHttpUrl, normalizeLinkPreview } from './linkPreview';

export type MediaArticleInsertPayload = {
  author_id: string;
  actor_type: 'user';
  actor_id: string;
  post_type: 'media_article';
  text: string;
  link_preview: LinkPreview;
  feed_targets: string[];
};

export function normalizeMediaArticleUrl(value: string): string | null {
  const normalizedUrl = normalizeHttpUrl(value);
  if (!normalizedUrl) {
    return null;
  }

  const parsedUrl = new URL(normalizedUrl);
  parsedUrl.hash = '';
  return parsedUrl.toString();
}

export function buildMediaArticleInsertPayload(input: {
  authorId: string;
  url: string;
  caption?: string | null;
  preview?: Partial<LinkPreview> | null;
}): MediaArticleInsertPayload {
  const authorId = input.authorId.trim();
  if (!authorId) {
    throw new TypeError('media_article requires an author');
  }

  const url = normalizeMediaArticleUrl(input.url);
  if (!url) {
    throw new TypeError('media_article requires a valid HTTP(S) URL');
  }

  const linkPreview = normalizeLinkPreview({
    ...input.preview,
    url,
  }) ?? { url };

  assertValidPostSubtypePayload('media_article', linkPreview);

  return {
    author_id: authorId,
    actor_type: 'user',
    actor_id: authorId,
    post_type: 'media_article',
    text: input.caption?.trim() ?? '',
    link_preview: linkPreview,
    feed_targets: ['home'],
  };
}
