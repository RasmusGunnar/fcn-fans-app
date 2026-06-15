import type { LinkPreview } from '../types/news';
import { normalizePostType } from '../types/post';
import { getLinkPreviewDomain, normalizeLinkPreview } from './linkPreview';
import { getMediaArticleSourceName } from './mediaArticlePresentation';

export type MediaArticleAdminRow = {
  id: string;
  created_at: string | null;
  text: string | null;
  link_preview: unknown;
  post_type: unknown;
};

export type MediaArticleAdminItem = {
  id: string;
  createdAt: string;
  caption: string;
  title: string;
  url: string;
  domain: string;
  sourceName: string;
  statusLabel: 'Publiceret';
  linkPreview: LinkPreview;
};

export function canAccessMediaArticleAdmin(isAppAdmin: boolean): boolean {
  return isAppAdmin;
}

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildMediaArticleAdminItems(
  rows: readonly MediaArticleAdminRow[],
): MediaArticleAdminItem[] {
  return rows
    .flatMap((row) => {
      if (normalizePostType(row.post_type) !== 'media_article') {
        return [];
      }

      const linkPreview = normalizeLinkPreview(row.link_preview);
      if (!linkPreview) {
        return [];
      }

      const domain = getLinkPreviewDomain(linkPreview.url) ?? linkPreview.url;

      return [{
        id: row.id,
        createdAt: row.created_at ?? '',
        caption: row.text?.trim() ?? '',
        title: linkPreview.title?.trim() || 'Artikel uden titel',
        url: linkPreview.url,
        domain,
        sourceName: getMediaArticleSourceName(linkPreview),
        statusLabel: 'Publiceret' as const,
        linkPreview,
      }];
    })
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt));
}
