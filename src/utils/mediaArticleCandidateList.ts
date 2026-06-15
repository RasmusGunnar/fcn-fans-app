import {
  type MediaArticleCandidateItem,
  type MediaArticleCandidateStatus,
} from './mediaArticleCandidates';

export type MediaArticleCandidateSort = 'newest' | 'relevance';

export const DEFAULT_MEDIA_ARTICLE_CANDIDATE_STATUS: MediaArticleCandidateStatus = 'pending';
export const ALL_MEDIA_ARTICLE_SOURCES = '__all_sources__';

export type MediaArticleCandidateStatusCounts = Record<MediaArticleCandidateStatus, number>;

function toTimestamp(value: string | null | undefined): number {
  const timestamp = new Date(value ?? '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getCandidateTimestamp(candidate: MediaArticleCandidateItem): number {
  return toTimestamp(candidate.publishedAt ?? candidate.createdAt);
}

export function getMediaArticleCandidateStatusCounts(
  candidates: readonly MediaArticleCandidateItem[],
): MediaArticleCandidateStatusCounts {
  return candidates.reduce<MediaArticleCandidateStatusCounts>(
    (counts, candidate) => {
      counts[candidate.status] += 1;
      return counts;
    },
    {
      pending: 0,
      approved: 0,
      rejected: 0,
      ignored: 0,
    },
  );
}

export function getMediaArticleCandidateSourceNames(
  candidates: readonly MediaArticleCandidateItem[],
): string[] {
  return Array.from(
    new Set(candidates.map((candidate) => candidate.sourceName.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, 'da'));
}

export function filterMediaArticleCandidates(
  candidates: readonly MediaArticleCandidateItem[],
  options: {
    status?: MediaArticleCandidateStatus;
    sourceName?: string;
    sort?: MediaArticleCandidateSort;
  } = {},
): MediaArticleCandidateItem[] {
  const status = options.status ?? DEFAULT_MEDIA_ARTICLE_CANDIDATE_STATUS;
  const sourceName = options.sourceName ?? ALL_MEDIA_ARTICLE_SOURCES;
  const sort = options.sort ?? 'newest';

  return candidates
    .filter(
      (candidate) =>
        candidate.status === status &&
        (sourceName === ALL_MEDIA_ARTICLE_SOURCES || candidate.sourceName.trim() === sourceName),
    )
    .sort((left, right) => {
      if (sort === 'relevance') {
        const relevanceDifference = right.relevanceScore - left.relevanceScore;
        if (relevanceDifference !== 0) {
          return relevanceDifference;
        }
      }

      return getCandidateTimestamp(right) - getCandidateTimestamp(left);
    });
}
