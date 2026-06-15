import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMediaArticleCandidateItems,
  candidateHasPublishedFeedPost,
  canApproveMediaArticleCandidate,
} from '../mediaArticleCandidates';

const baseRow = {
  id: 'candidate-1',
  source_key: 'bold',
  source_name: 'Bold.dk',
  source_url: 'https://bold.dk/fodbold/nyheder/fcn',
  canonical_url: 'https://bold.dk/fodbold/nyheder/fcn',
  title: 'FCN henter ny spiller',
  description: 'En beskrivelse',
  image_url: null,
  caption: '',
  published_at: '2026-06-11T08:00:00.000Z',
  detected_keywords: ['FCN'],
  relevance_score: 88,
  status: 'pending',
  reviewed_at: null,
  published_post_id: null,
  created_at: '2026-06-11T09:00:00.000Z',
  updated_at: '2026-06-11T09:00:00.000Z',
};

test('maps a candidate into the admin review model', () => {
  const candidate = buildMediaArticleCandidateItems([baseRow])[0];

  assert.ok(candidate);
  assert.equal(candidate.sourceName, 'Bold.dk');
  assert.equal(candidate.statusLabel, 'Afventer');
  assert.equal(candidate.relevanceScore, 88);
  assert.equal(canApproveMediaArticleCandidate(candidate), true);
});

test('rejected and ignored candidates have no published feed post', () => {
  for (const status of ['rejected', 'ignored'] as const) {
    const candidate = buildMediaArticleCandidateItems([{ ...baseRow, status }])[0];

    assert.ok(candidate);
    assert.equal(canApproveMediaArticleCandidate(candidate), false);
    assert.equal(candidateHasPublishedFeedPost(candidate), false);
  }
});

test('only approved candidates linked to a post are represented as published', () => {
  const candidate = buildMediaArticleCandidateItems([
    {
      ...baseRow,
      status: 'approved',
      published_post_id: 'post-1',
    },
  ])[0];

  assert.ok(candidate);
  assert.equal(candidateHasPublishedFeedPost(candidate), true);
});
