import { getLinkPreviewDomain } from './linkPreview';

export type MediaArticleCandidateStatus = 'pending' | 'approved' | 'rejected' | 'ignored';

export type MediaArticleCandidateRow = {
  id: string;
  source_key: string;
  source_name: string;
  source_url: string;
  canonical_url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  caption: string | null;
  published_at: string | null;
  detected_keywords: unknown;
  relevance_score: number;
  status: string;
  reviewed_at: string | null;
  published_post_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaArticleCandidateItem = {
  id: string;
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  domain: string;
  title: string;
  description: string;
  imageUrl: string;
  caption: string;
  publishedAt: string | null;
  detectedKeywords: string[];
  relevanceScore: number;
  status: MediaArticleCandidateStatus;
  statusLabel: string;
  reviewedAt: string | null;
  publishedPostId: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_ORDER: Record<MediaArticleCandidateStatus, number> = {
  pending: 0,
  rejected: 1,
  ignored: 2,
  approved: 3,
};

export function normalizeMediaArticleCandidateStatus(value: unknown): MediaArticleCandidateStatus {
  if (value === 'approved' || value === 'rejected' || value === 'ignored') {
    return value;
  }

  return 'pending';
}

export function getMediaArticleCandidateStatusLabel(status: MediaArticleCandidateStatus): string {
  switch (status) {
    case 'approved':
      return 'Publiceret';
    case 'rejected':
      return 'Afvist';
    case 'ignored':
      return 'Ignoreret';
    default:
      return 'Afventer';
  }
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toTimestamp(value: string | null | undefined): number {
  const timestamp = new Date(value ?? '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildMediaArticleCandidateItems(
  rows: readonly MediaArticleCandidateRow[],
): MediaArticleCandidateItem[] {
  return rows
    .map((row) => {
      const status = normalizeMediaArticleCandidateStatus(row.status);

      return {
        id: row.id,
        sourceKey: row.source_key.trim(),
        sourceName: row.source_name.trim() || 'Ekstern kilde',
        sourceUrl: row.source_url.trim(),
        canonicalUrl: row.canonical_url.trim(),
        domain:
          getLinkPreviewDomain(row.canonical_url) ??
          getLinkPreviewDomain(row.source_url) ??
          row.source_url,
        title: row.title.trim() || 'Artikel uden titel',
        description: row.description?.trim() ?? '',
        imageUrl: row.image_url?.trim() ?? '',
        caption: row.caption?.trim() ?? '',
        publishedAt: row.published_at,
        detectedKeywords: cleanStringArray(row.detected_keywords),
        relevanceScore: Math.max(0, Math.min(100, row.relevance_score || 0)),
        status,
        statusLabel: getMediaArticleCandidateStatusLabel(status),
        reviewedAt: row.reviewed_at,
        publishedPostId: row.published_post_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    })
    .sort((left, right) => {
      const statusDifference = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (statusDifference !== 0) {
        return statusDifference;
      }

      return (
        toTimestamp(right.publishedAt ?? right.createdAt) -
        toTimestamp(left.publishedAt ?? left.createdAt)
      );
    });
}

export function canApproveMediaArticleCandidate(
  candidate: Pick<MediaArticleCandidateItem, 'status'>,
): boolean {
  return candidate.status === 'pending';
}

export function candidateHasPublishedFeedPost(
  candidate: Pick<MediaArticleCandidateItem, 'status' | 'publishedPostId'>,
): boolean {
  return candidate.status === 'approved' && Boolean(candidate.publishedPostId);
}
