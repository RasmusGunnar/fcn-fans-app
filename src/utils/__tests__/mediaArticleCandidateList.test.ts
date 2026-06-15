import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_MEDIA_ARTICLE_SOURCES,
  DEFAULT_MEDIA_ARTICLE_CANDIDATE_STATUS,
  filterMediaArticleCandidates,
  getMediaArticleCandidateSourceNames,
  getMediaArticleCandidateStatusCounts,
} from '../mediaArticleCandidateList';
import type { MediaArticleCandidateItem } from '../mediaArticleCandidates';

function candidate(
  id: string,
  status: MediaArticleCandidateItem['status'],
  sourceName: string,
  relevanceScore: number,
  publishedAt: string,
): MediaArticleCandidateItem {
  return {
    id,
    sourceKey: sourceName.toLowerCase(),
    sourceName,
    sourceUrl: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    domain: 'example.com',
    title: id,
    description: '',
    imageUrl: '',
    caption: '',
    publishedAt,
    detectedKeywords: ['FCN'],
    relevanceScore,
    status,
    statusLabel: status,
    reviewedAt: null,
    publishedPostId: status === 'approved' ? `post-${id}` : null,
    createdAt: publishedAt,
    updatedAt: publishedAt,
  };
}

const candidates = [
  candidate('pending-old', 'pending', 'Bold.dk', 95, '2026-06-10T08:00:00.000Z'),
  candidate('pending-new', 'pending', 'Tipsbladet', 70, '2026-06-11T08:00:00.000Z'),
  candidate('pending-campo', 'pending', 'Campo', 88, '2026-06-09T08:00:00.000Z'),
  candidate('approved', 'approved', 'Bold.dk', 90, '2026-06-08T08:00:00.000Z'),
  candidate('ignored', 'ignored', 'Campo', 60, '2026-06-07T08:00:00.000Z'),
  candidate('rejected', 'rejected', 'Tipsbladet', 40, '2026-06-06T08:00:00.000Z'),
];

test('default candidate view contains pending items only, newest first', () => {
  assert.equal(DEFAULT_MEDIA_ARTICLE_CANDIDATE_STATUS, 'pending');
  assert.deepEqual(
    filterMediaArticleCandidates(candidates).map((item) => item.id),
    ['pending-new', 'pending-old', 'pending-campo'],
  );
});

test('candidate list filters by status and source', () => {
  assert.deepEqual(
    filterMediaArticleCandidates(candidates, {
      status: 'pending',
      sourceName: 'Bold.dk',
    }).map((item) => item.id),
    ['pending-old'],
  );
  assert.deepEqual(
    filterMediaArticleCandidates(candidates, {
      status: 'ignored',
      sourceName: ALL_MEDIA_ARTICLE_SOURCES,
    }).map((item) => item.id),
    ['ignored'],
  );
});

test('candidate list can sort by highest relevance first', () => {
  assert.deepEqual(
    filterMediaArticleCandidates(candidates, {
      status: 'pending',
      sort: 'relevance',
    }).map((item) => item.id),
    ['pending-old', 'pending-campo', 'pending-new'],
  );
});

test('a reviewed candidate leaves the pending view immediately', () => {
  const updatedCandidates = candidates.map((item) =>
    item.id === 'pending-new' ? { ...item, status: 'ignored' as const } : item,
  );

  assert.deepEqual(
    filterMediaArticleCandidates(updatedCandidates).map((item) => item.id),
    ['pending-old', 'pending-campo'],
  );
  assert.deepEqual(
    filterMediaArticleCandidates(updatedCandidates, {
      status: 'ignored',
    }).map((item) => item.id),
    ['pending-new', 'ignored'],
  );
});

test('candidate sources are unique and status counts include every tab', () => {
  assert.deepEqual(getMediaArticleCandidateSourceNames(candidates), [
    'Bold.dk',
    'Campo',
    'Tipsbladet',
  ]);
  assert.deepEqual(getMediaArticleCandidateStatusCounts(candidates), {
    pending: 3,
    approved: 1,
    ignored: 1,
    rejected: 1,
  });
});
